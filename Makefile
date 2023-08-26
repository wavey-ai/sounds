.PHONY: ecr
ecr:
	aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
	aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(AWS_ACCOUNT).dkr.ecr.us-east-1.amazonaws.com

.PHONY: touch
touch:
	openssl rand -base64 12 > lambda/get-upload/.touch
	openssl rand -base64 12 > lambda/get-sounds/.touch
	openssl rand -base64 12 > lambda/ws-pub/.touch
	openssl rand -base64 12 > lambda/ws-sub/.touch
	openssl rand -base64 12 > lambda/test-auth-token/.touch
	openssl rand -base64 12 > lambda/create-clips/.touch
	openssl rand -base64 12 > lambda/get-clips/.touch
	openssl rand -base64 12 > lambda/uploads/.touch

.PHONY: deploy
deploy:
	aws cloudformation deploy \
	 --region eu-west-2 \
	 --stack-name $(ENV)-${STACK_NAME} \
		--template-file template.yml \
		--capabilities CAPABILITY_NAMED_IAM \
		--parameter-overrides \
			PipelineOnly=yes \
			RepositoryId=wavey-ai/sounds \
			CodeStarConnectionArn=$(CODESTAR_CONNECTION_ARN) \
			BranchName=$(BRANCH_NAME) \
			StageName=$(ENV) \
			Certificate=$(CERTIFICATE_ARN) \
			DomainName=$(DOMAIN_NAME) \
			HostedZoneId=$(HOSTED_ZONE_ID) \
			UploadsPrefix=$(UPLOADS_PREFIX)

.PHONY: cp_zips
cp_zips:
	cd ./lambda/get-upload && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/get-upload/
	cd ./lambda/get-sounds && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/get-sounds/
	cd ./lambda/ws-pub && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/ws-pub/
	cd ./lambda/ws-sub && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/ws-sub/
	cd ./lambda/test-auth-token && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/test-auth-token/
	cd ./lambda/create-clips && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/create-clips/
	cd ./lambda/get-clips && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/get-clips/
	cd ./lambda/uploads && \
		aws s3 cp build/function.zip s3://$(BOOTSTRAP_BUCKET)/latest/uploads/


.PHONY: build_zips
build_zips:
	cd ./lambda/get-upload && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/get-sounds && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/ws-pub && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/ws-sub && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/create-clips && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/get-clips && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/uploads && \
	GOOS=linux GOARCH=amd64 go build -o main \
		&& rm -rf build && mkdir build && zip build/function.zip main
	cd ./lambda/test-auth-token && \
		npm install --omit=dev && \
		rm -rf build && mkdir build && \
		esbuild auth.js --bundle --outfile=main.js --platform=node  --external:'aws-sdk' && \
		zip -r build/function.zip main.js && rm main.js

.PHONY: package
package:
	 sam package \
		 --template-file template.yml \
	 	 --output-template-file packaged-template.yml \
		 --image-repository=$(ECR_REPO) \
		 --s3-bucket=$(SAM_ARTIFACTS_BUCKET)
