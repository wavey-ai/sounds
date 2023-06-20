package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbTypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
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

	h := handler{dbCl, tableName, &log}

	lambda.Start(h.handleRequest)
}

type handler struct {
	dbCl      *dynamodb.Client
	tableName string
	log       *zerolog.Logger
}

type Clip struct {
	Key   string `json:"key"`
	Sound string `json:"sound"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	Hz    int    `json:"hz"`
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

	var clips []Clip

	if err := json.Unmarshal([]byte(event.Body), &clips); err != nil {
		h.log.Fatal().Err(err).Msg("Error unmarshalling request body")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusBadRequest,
		}, nil
	}

	for i, clip := range clips {
		id := ksuid.New().String()
		clip.Key = id

		input := &dynamodb.PutItemInput{
			TableName: &h.tableName,
			Item: map[string]dynamodbTypes.AttributeValue{
				"sound": &dynamodbTypes.AttributeValueMemberS{
					Value: clip.Sound,
				},
				"key": &dynamodbTypes.AttributeValueMemberS{
					Value: id,
				},
				"start": &dynamodbTypes.AttributeValueMemberN{
					Value: strconv.Itoa(clip.Start),
				},
				"end": &dynamodbTypes.AttributeValueMemberN{
					Value: strconv.Itoa(clip.End),
				},
				"hz": &dynamodbTypes.AttributeValueMemberN{
					Value: strconv.Itoa(clip.Hz),
				},
			},
		}

		clips[i].Key = id

		if _, err := h.dbCl.PutItem(context.TODO(), input); err != nil {
			h.log.Fatal().Err(err).Msg("Error putting to DynamoDB")
			return events.APIGatewayV2HTTPResponse{
				StatusCode: http.StatusInternalServerError,
			}, nil
		}
	}

	b, err := json.Marshal(&clips)
	if err != nil {
		h.log.Fatal().Err(err).Msg("Error marshalling clip")
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusInternalServerError,
		}, nil
	}

	return events.APIGatewayV2HTTPResponse{
		StatusCode: http.StatusOK,
		Body:       string(b),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
