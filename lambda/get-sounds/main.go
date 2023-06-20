package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/expression"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
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
	tableName := os.Getenv("TABLE_NAME")

	h := handler{dbCl, &tableName, &log}

	lambda.Start(h.handleRequest)
}

type Item struct {
	User     string `json:"user"`
	Key      string `json:"key"`
	Filename string `json:"filename"`
	Format   string `json:"format"`
}

type handler struct {
	dbCl      *dynamodb.Client
	tableName *string
	log       *zerolog.Logger
}

func (h handler) handleRequest(ctx context.Context, event events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	user, ok := event.RequestContext.Authorizer.JWT.Claims["cognito:username"]
	if ok {
		h.log.Info().Msgf("Got user %s from claims", user)
	} else {
		h.log.Error().Msgf("Cannot get userid from JWT claims: %+v", event.RequestContext.Authorizer.JWT.Claims)
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       "Internal Server Error",
		}, nil
	}

	var err error
	var response *dynamodb.QueryOutput
	var items []Item
	keyEx := expression.Key("user").Equal(expression.Value(user))
	expr, err := expression.NewBuilder().WithKeyCondition(keyEx).Build()
	if err != nil {
		h.log.Error().Err(err).Msg("Error building expression")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       "Internal Server Error",
		}, nil
	}

	response, err = h.dbCl.Query(context.TODO(), &dynamodb.QueryInput{
		TableName:                 h.tableName,
		ExpressionAttributeNames:  expr.Names(),
		ExpressionAttributeValues: expr.Values(),
		KeyConditionExpression:    expr.KeyCondition(),
	})
	if err != nil {
		h.log.Error().Err(err).Msg("Error querying DynamoDB")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       "Internal Server Error",
		}, nil
	}

	if err := attributevalue.UnmarshalListOfMaps(response.Items, &items); err != nil {
		h.log.Error().Err(err).Msg("Error unmarshaling DynamoDB response")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       "Internal Server Error",
		}, nil
	}

	b, err := json.Marshal(&items)
	if err != nil {
		h.log.Error().Err(err).Msg("Error marshaling JSON response")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       "Internal Server Error",
		}, nil
	}

	return events.APIGatewayV2HTTPResponse{
		StatusCode: http.StatusOK,
		Body:       string(b),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
