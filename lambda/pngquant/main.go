package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/segmentio/ksuid"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	invocationId := ksuid.New().String()
	log := log.With().Str("invocationId", invocationId).Logger()

	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		log.Fatal().Err(err).Msgf("Error loading SDK config")
	}

	s3Cl := s3.NewFromConfig(cfg)

	soundsBucket := os.Getenv("SOUNDS_BUCKET")

	h := handler{
		s3Cl,
		soundsBucket,
		&log,
	}

	lambda.Start(h.handler)
}

type handler struct {
	s3cl         *s3.Client
	soundsBucket string
	log          *zerolog.Logger
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

			k := strings.Replace(objectPath, "png", "png-fs8", 1)

			srcUrl := fmt.Sprintf("s3://%s/%s", bucket, objectPath)
			dstUrl := fmt.Sprintf("s3://%s/%s", bucket, k)

			cmd := exec.Command("/app/process.sh", srcUrl, dstUrl)
			stderr := &bytes.Buffer{}
			cmd.Stderr = stderr

			err = cmd.Run()
			if err != nil {
				h.log.Err(err).Msgf("process command error output: %s", stderr.String())
				return msg, err
			}

			log.Info().Msg("process task completed")

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
	}
	return
}
