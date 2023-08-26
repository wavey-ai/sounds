package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbTypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/segmentio/ksuid"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	invocationId := ksuid.New().String()
	log := log.With().
		Str("invocationId", invocationId).Logger()

	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		log.Fatal().Err(err).Msgf("Error loading SDK config")
	}

	dbCl := dynamodb.NewFromConfig(cfg)
	s3Cl := s3.NewPresignClient(s3.NewFromConfig(cfg))
	bucketName := os.Getenv("BUCKET_NAME")
	tableName := os.Getenv("TABLE_NAME")

	h := handler{dbCl, s3Cl, bucketName, tableName, &log}

	lambda.Start(h.handleRequest)
}

type handler struct {
	dbCl       *dynamodb.Client
	s3Cl       *s3.PresignClient
	bucketName string
	tableName  string
	log        *zerolog.Logger
}

type PresignedURLResponse struct {
	URL      string `json:"url"`
	Key      string `json:"key"`
	Sub      string `json:"sub"`
	Filename string `json:"filename"`
}

func (h handler) handleRequest(ctx context.Context, event events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	var user string
	var ok bool

	if event.RequestContext.Authorizer != nil &&
		event.RequestContext.Authorizer.JWT != nil &&
		event.RequestContext.Authorizer.JWT.Claims != nil {
		user, ok = event.RequestContext.Authorizer.JWT.Claims["cognito:username"]
	}

	if !ok {
		h.log.Fatal().Msgf("Cannot get userid from JWT claims: %+v", event.RequestContext.Authorizer.JWT.Claims)
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
		}, nil
	}

	h.log.Info().Msgf("Got user %s from claims", user)

	filename := event.QueryStringParameters["filename"]

	decodedName, err := url.QueryUnescape(filename)
	if err != nil || decodedName == "" {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusBadRequest,
		}, err
	}

	key := ksuid.New().String()

	log := h.log.With().
		Str("objectKey", key).
		Str("bucketName", h.bucketName).
		Logger()

	input := &dynamodb.PutItemInput{
		TableName: &h.tableName,
		Item: map[string]dynamodbTypes.AttributeValue{
			"user": &dynamodbTypes.AttributeValueMemberS{
				Value: user,
			},
			"key": &dynamodbTypes.AttributeValueMemberS{
				Value: key,
			},
			"filename": &dynamodbTypes.AttributeValueMemberS{
				Value: filename,
			},
		},
	}

	if _, err := h.dbCl.PutItem(context.TODO(), input); err != nil {
		log.Fatal().Err(err).Msg("Error putting to DynamoDB")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
		}, nil
	}

	putObjectArgs := s3.PutObjectInput{
		Bucket: &h.bucketName,
		Key:    &key,
	}

	options := func(opts *s3.PresignOptions) {
		opts.Expires = time.Duration(5 * time.Minute)
	}

	res, err := h.s3Cl.PresignPutObject(context.Background(), &putObjectArgs, options)
	if err != nil {
		log.Error().Err(err).Msg("Error generating Presigned URL")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
		}, nil
	}

	log.Info().Msgf("Created signed URL")

	response := PresignedURLResponse{
		URL:      res.URL,
		Filename: filename,
	}

	buf := new(bytes.Buffer)
	enc := json.NewEncoder(buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(&response); err != nil {
		log.Error().Err(err).Msg("Error marshaling JSON response")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
		}, nil
	}

	return events.APIGatewayV2HTTPResponse{
		StatusCode: http.StatusOK,
		Body:       buf.String(),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
