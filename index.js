const AWS = require('aws-sdk');
const linq = require('linq');

AWS.config.update({
    credentials: { accessKeyId: "", secretAccessKey: "" },
    region: "us-west-2"
});

const rekognition = new AWS.Rekognition({ apiVersion: '2016-06-27' });
const dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

//const s3 = new AWS.S3({ apiVersion: "2006-03-01", accessKeyId: 1 });

exports.handler = function (event, context, callback) {
    console.log("Event: ", JSON.stringify(event, null, "\t"));
    console.log("Context: ", JSON.stringify(context, null, "\t"));

    const record = event.Records[0];
    if (!record) throw new Error("No record");

    const bucket = record.s3.bucket.name;
    const file = record.s3.object.key;
    const region = record.awsRegion;

    const req = {
        "Image": {
            "S3Object": { "Bucket": bucket, "Name": file }
        }
    };

    rekognition.detectText(req, (err, res) => {
        if (!err) console.log(err);
        console.log(res.TextDetections);

        const match = linq
            .from(res.TextDetections)
            .where(td => td.Confidence > .8)
            .orderByDescending(td => td.Geometry.BoundingBox.Width * td.Geometry.BoundingBox.Height)
            .firstOrDefault();

        if (match) {
            const plateNumber = match.DetectedText.replace(" ", "");
            const url = "https://s3-" + region + ".amazonaws.com/" + bucket + "/" + file;
            onMatchFound(plateNumber, url);
        }
    });

    callback(null);
};

function onMatchFound(plateNumber, url) {
    console.log('found match! ' + plateNumber);

    if (plateNumber === "TRUMP") {
        sendNotification(`ALERT: TOXIC ORANGE SUBSTANCE!!! ${url}`, url);
    } else {
        var params = {
            Key: { "plateNumber": { S: plateNumber } },
            TableName: "POCTrash3"
        };

        dynamodb.getItem(params, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            console.log(data);

            //addVisit(data, url);

            if (data && data.Item && data.Item.citations) {
                const message = buildNotificationMessage(plateNumber, url, data);
                console.log(message);
                sendNotification(message, url);
            } else {
                sendNotification(`${plateNumber} has no citations. ${url}`, url);
            }
        });
    }
}

function addVisit(plateNumber, imageCaptureUrl) {
    var params = {
        Key: { "plateNumber": { S: plateNumber } },
        TableName: "POCTrash3"
    };
}

function buildNotificationMessage(plateNumber, url, data) {
    return `ALERT: ${plateNumber} has ${data.Item.citations.L.length} citation(s). ${url}`;
}

function sendNotification(message) {
    var sns = new AWS.SNS();

    sns.publish({
        Message: message,
        TopicArn: ''
    }, function (err, data) {
        if (err) {
            console.log(err.stack);
            return;
        }//
        console.log('push sent');
        console.log(data);
    });
}
