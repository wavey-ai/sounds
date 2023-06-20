package main

import (
	"context"
	"encoding/json"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbTypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
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

	h := handler{db, &log}
	lambda.Start(h.handleRequest)
}

type handler struct {
	db  *dynamodb.Client
	log *zerolog.Logger
}

type Body struct {
	Topic string `json:"topic"`
}

func (h *handler) handleRequest(ctx context.Context, request events.APIGatewayWebsocketProxyRequest) (events.APIGatewayProxyResponse, error) {
	routeKey := request.Headers["X-Amz-Target"]

	switch routeKey {
	case "$connect":
		return events.APIGatewayProxyResponse{Body: "Hi.", StatusCode: 200}, nil

	case "$disconnect":
		input := &dynamodb.DeleteItemInput{
			TableName: aws.String(os.Getenv("TABLE_NAME")),
			Key: map[string]dynamodbTypes.AttributeValue{
				"connectionId": &dynamodbTypes.AttributeValueMemberS{
					Value: request.RequestContext.ConnectionID,
				},
			},
		}

		_, err := h.db.DeleteItem(ctx, input)
		if err != nil {
			log.Err(err).Msgf("Error deleting from dynamo")

			return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 500}, nil
		}

		return events.APIGatewayProxyResponse{Body: "Bye.", StatusCode: 200}, nil

	case "subscribe":
		body := Body{}
		if err := json.Unmarshal([]byte(request.Body), &body); err != nil {
			log.Err(err).Msgf("Error unmarshalling JSON request")

			return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 500}, nil
		}

		input := &dynamodb.PutItemInput{
			TableName: aws.String(os.Getenv("TABLE_NAME")),
			Item: map[string]dynamodbTypes.AttributeValue{
				"connectionId": &dynamodbTypes.AttributeValueMemberS{
					Value: request.RequestContext.ConnectionID,
				},
				"topic": &dynamodbTypes.AttributeValueMemberS{
					Value: body.Topic,
				},
			},
		}

		_, err := h.db.PutItem(ctx, input)
		if err != nil {
			log.Err(err).Msgf("Error putting to dynamo")

			return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 500}, nil

		}

		return events.APIGatewayProxyResponse{Body: "Subscribed: " + request.Body, StatusCode: 200}, nil
	}

	return events.APIGatewayProxyResponse{Body: "", StatusCode: 404}, nil
}
