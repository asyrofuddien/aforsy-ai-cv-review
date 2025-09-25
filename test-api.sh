#!/bin/bash

API_URL="http://localhost:3000/api"

echo "=== Testing CV Evaluation API ==="
echo ""

# Test 1: Upload documents
echo "1. Testing Upload Endpoint..."
UPLOAD_RESPONSE=$(curl -s -X POST $API_URL/upload \
  -F "cv=@test-files/sample-cv.txt" \
  -F "project=@test-files/sample-project.txt")

echo "Response: $UPLOAD_RESPONSE"
echo ""

# Extract IDs from response (using jq if available, or manually)
CV_ID=$(echo $UPLOAD_RESPONSE | grep -o '"cvDocumentId":"[^"]*' | cut -d'"' -f4)
PROJECT_ID=$(echo $UPLOAD_RESPONSE | grep -o '"projectDocumentId":"[^"]*' | cut -d'"' -f4)

echo "CV Document ID: $CV_ID"
echo "Project Document ID: $PROJECT_ID"
echo ""

# Test 2: Start evaluation
echo "2. Testing Evaluate Endpoint..."
EVAL_RESPONSE=$(curl -s -X POST $API_URL/evaluate \
  -H "Content-Type: application/json" \
  -d "{
    \"cvDocumentId\": \"$CV_ID\",
    \"projectDocumentId\": \"$PROJECT_ID\",
    \"candidateName\": \"John Doe\"
  }")

echo "Response: $EVAL_RESPONSE"
echo ""

# Extract evaluation ID
EVAL_ID=$(echo $EVAL_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Evaluation ID: $EVAL_ID"
echo ""

# Test 3: Check result (immediate)
echo "3. Testing Get Result Endpoint (immediate)..."
curl -s $API_URL/result/$EVAL_ID | jq .
echo ""

# Wait for processing
echo "Waiting 6 seconds for processing..."
sleep 6

# Test 4: Check result (after processing)
echo "4. Testing Get Result Endpoint (after processing)..."
curl -s $API_URL/result/$EVAL_ID | jq .