package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/expression"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbTypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/segmentio/ksuid"
)

const (
	Stream128k = "stream_128k"
	Stream96k  = "stream_96k"
	PCM16k     = "pcm_s16le"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	invocationId := ksuid.New().String()
	log := log.With().Str("invocationId", invocationId).Logger()

	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		log.Fatal().Err(err).Msgf("Error loading SDK config")
	}

	dbCl := dynamodb.NewFromConfig(cfg)
	s3Cl := s3.NewFromConfig(cfg)
	snsCl := sns.NewFromConfig(cfg)

	topicArn := os.Getenv("TOPIC_ARN")
	uploadsTbl := os.Getenv("UPLOADS_TABLE_NAME")
	formatsTbl := os.Getenv("FORMATS_TABLE_NAME")
	soundsBucket := os.Getenv("SOUNDS_BUCKET")

	h := handler{
		dbCl,
		s3Cl,
		snsCl,
		topicArn,
		uploadsTbl,
		formatsTbl,
		soundsBucket,
		&log,
	}

	lambda.Start(h.handler)
}

type handler struct {
	dbCl         *dynamodb.Client
	s3cl         *s3.Client
	snsCl        *sns.Client
	topicArn     string
	uploadsTbl   string
	formatsTbl   string
	soundsBucket string
	log          *zerolog.Logger
}

type Item struct {
	User     string `json:"user"`
	Key      string `json:"key"`
	Filename string `json:"filename"`
}

type MessageBody struct {
	Records []events.S3EventRecord `json:"Records"`
}

func (h handler) handler(evt events.SQSEvent) (msg string, err error) {
	h.log.Info().Msgf("Received event: %+v", evt)
	for _, message := range evt.Records {
		var s3evt MessageBody
		err := json.Unmarshal([]byte(message.Body), &s3evt)
		if err != nil {
			h.log.Error().Msgf("Error unmarshalling SQS message to S3 event: %v", err)
			continue
		}
		for _, record := range s3evt.Records {
			bucket := record.S3.Bucket.Name
			objectPath := record.S3.Object.Key
			objectKey := path.Base(objectPath)

			var err error
			var response *dynamodb.QueryOutput
			var items []Item
			keyEx := expression.Key("key").Equal(expression.Value(objectKey))
			expr, err := expression.NewBuilder().WithKeyCondition(keyEx).Build()
			if err != nil {
				h.log.Err(err).Msg("Error building expression for query.")
				return msg, err
			} else {
				response, err = h.dbCl.Query(context.TODO(), &dynamodb.QueryInput{
					TableName:                 &h.uploadsTbl,
					ExpressionAttributeNames:  expr.Names(),
					ExpressionAttributeValues: expr.Values(),
					KeyConditionExpression:    expr.KeyCondition(),
				})
				if err != nil {
					h.log.Err(err).Msg("Error querying dynamodb")
					return msg, err
				} else {
					if err := attributevalue.UnmarshalListOfMaps(response.Items, &items); err != nil {
						h.log.Fatal().Err(err).Msg("Error unmarshaling dynamodb response")
					}
				}
			}

			if len(items) != 1 {
				err = fmt.Errorf("Upload id %s not found in dynamo table %s", objectKey, h.uploadsTbl)
				return msg, err
			}

			srcUrl := fmt.Sprintf("s3://%s/%s", bucket, objectPath)
			dstUrl := fmt.Sprintf("s3://%s", h.soundsBucket)

			cmd := exec.Command("/app/process.sh", srcUrl, dstUrl, objectKey)
			stderr := &bytes.Buffer{}
			cmd.Stderr = stderr

			err = cmd.Run()
			if err != nil {
				h.log.Err(err).Msgf("process command error output: %s", stderr.String())
				return msg, err
			}

			log.Info().Msg("process task completed")

			keys := []string{
				fmt.Sprintf("stream/%s/%s_%s", objectKey, objectKey, Stream96k),
				fmt.Sprintf("av/%s/%s_waveform.dat", objectKey, objectKey),
			}

			for _, k := range keys {
				params := &s3.HeadObjectInput{
					Bucket: &h.soundsBucket,
					Key:    &k,
				}

				resp, err := h.s3cl.HeadObject(context.TODO(), params)
				if err != nil {
					h.log.Err(err).Msgf("error HeadObject %s", k)
					return msg, err
				}

				if resp.ContentLength == 0 {
					h.log.Err(err).Msgf("object %s is zero bytes", k)
					return msg, err
				}
			}

			input := &dynamodb.PutItemInput{
				TableName: &h.formatsTbl,
				Item: map[string]dynamodbTypes.AttributeValue{
					"user": &dynamodbTypes.AttributeValueMemberS{
						Value: items[0].User,
					},
					"key": &dynamodbTypes.AttributeValueMemberS{
						Value: objectKey,
					},
					"format": &dynamodbTypes.AttributeValueMemberS{
						Value: Stream96k,
					},
					"filename": &dynamodbTypes.AttributeValueMemberS{
						Value: items[0].Filename,
					},
				},
			}

			if _, err := h.dbCl.PutItem(context.TODO(), input); err != nil {
				log.Err(err).Msgf("Error putting to dynamo")
				return msg, err
			}

			msg := "Created"
			_, err = h.snsCl.Publish(context.TODO(), &sns.PublishInput{
				Message:  &msg,
				TopicArn: &h.topicArn,
			})
			if err != nil {
				// non-fatal error
				h.log.Err(err).Msg("Error publishing topic")
			}
		}
	}
	return
}
