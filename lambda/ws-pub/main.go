package main

import (
	"context"
	"encoding/json"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/apigatewaymanagementapi"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbTypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go/aws"
	gonanoid "github.com/matoous/go-nanoid/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	invocationId, err := gonanoid.New(21)
	if err != nil {
		log.Fatal().Err(err).Msg("Error getting invocationId")
	}

	log := log.With().
		Str("invocationId", invocationId).Logger()

	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		log.Fatal().Err(err).Msgf("Error loading SDK config")
	}

	db := dynamodb.NewFromConfig(cfg)
	gw := apigatewaymanagementapi.NewFromConfig(cfg)

	h := handler{db, gw, &log}
	lambda.Start(h.handleRequest)
}

type handler struct {
	db  *dynamodb.Client
	gw  *apigatewaymanagementapi.Client
	log *zerolog.Logger
}

type Message struct {
	Topic string                 `json:"topic"`
	Data  map[string]interface{} `json:"data"`
}

func (h handler) handleRequest(ctx context.Context, snsEvent events.SNSEvent) (err error) {
	if len(snsEvent.Records) == 0 {
		log.Info().Msg("No records in the event")
		return nil
	}

	msg := Message{}
	if err = json.Unmarshal([]byte(snsEvent.Records[0].SNS.Message), &msg); err != nil {
		log.Err(err).Msgf("Error unmarshalling JSON")
		return
	}

	input := &dynamodb.ScanInput{
		TableName:            aws.String(os.Getenv("TABLE_NAME")),
		ProjectionExpression: aws.String("connectionId"),
		FilterExpression:     aws.String("topic = :topic"),
		ExpressionAttributeValues: map[string]dynamodbTypes.AttributeValue{
			":topic": &dynamodbTypes.AttributeValueMemberS{
				Value: msg.Topic,
			},
		},
	}

	output, err := h.db.Scan(ctx, input)
	if err != nil {
		log.Err(err).Msgf("Error scanning dynamo")
		return
	}

	if len(output.Items) == 0 {
		log.Info().Msg("No items foundt")
		return
	}

	data, err := json.Marshal(msg.Data)
	if err != nil {
		log.Err(err).Msgf("Error unmarshalling JSON")
		return
	}

	for _, item := range output.Items {
		if connID, ok := item["connectionId"].(*dynamodbTypes.AttributeValueMemberS); ok {
			_, err = h.gw.PostToConnection(ctx, &apigatewaymanagementapi.PostToConnectionInput{
				ConnectionId: aws.String(connID.Value),
				Data:         data,
			})
			if err != nil {
				log.Err(err).Msgf("Error posting to connection")
				return
			}
		} else {
			log.Info().Msgf("Invalid connectionId: %s", item["connectionId"])
		}
	}

	return
}
