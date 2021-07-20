#!/bin/bash
set -e
echo "Deploying $1"
PWD=$(pwd)
DIRNAME=$(dirname $0)
cd $DIRNAME/src/helper/nodejs
npm install
cd ../../../
cp -a -i ./src/awshelper ./src/helper/nodejs/node_modules
npm install -g aws-cdk
npm install
npm run build
cdk synth $1
cdk deploy $1 --require-approval "never"
