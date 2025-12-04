#!/usr/bin/env python3
"""
Webhook listener for GitHub Actions deployment trigger
Listens for updates and automatically pulls new Docker images
"""

import os
import subprocess
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
import json
import hmac
import hashlib

# Configuration
WEBHOOK_PORT = int(os.getenv('WEBHOOK_PORT', 5000))
GITHUB_SECRET = os.getenv('GITHUB_WEBHOOK_SECRET', '')
APP_DIR = os.getenv('APP_DIR', '/home/aforsy/aforsy-ai-cv-review')
LOG_FILE = '/var/log/aforsy-webhook.log'

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class GitHubWebhookHandler(BaseHTTPRequestHandler):
    """Handle GitHub webhook events"""
    
    def do_POST(self):
        """Handle POST requests from GitHub"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        # Verify GitHub signature
        if not self._verify_signature(body):
            logger.warning("Invalid GitHub webhook signature")
            self.send_response(401)
            self.end_headers()
            return
        
        try:
            payload = json.loads(body.decode('utf-8'))
            event_type = self.headers.get('X-GitHub-Event', '')
            
            logger.info(f"Received GitHub event: {event_type}")
            
            # Handle push events to main branch
            if event_type == 'push' and payload.get('ref') == 'refs/heads/main':
                logger.info("Detected push to main branch - triggering deployment")
                self._trigger_deployment()
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'deployment triggered'}).encode())
            else:
                self.send_response(200)
                self.end_headers()
                
        except Exception as e:
            logger.error(f"Error processing webhook: {str(e)}")
            self.send_response(500)
            self.end_headers()
    
    def _verify_signature(self, body):
        """Verify GitHub webhook signature"""
        if not GITHUB_SECRET:
            return True
        
        signature = self.headers.get('X-Hub-Signature-256', '')
        if not signature:
            return False
        
        expected_signature = 'sha256=' + hmac.new(
            GITHUB_SECRET.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected_signature)
    
    def _trigger_deployment(self):
        """Trigger the deployment script"""
        try:
            script_path = os.path.join(os.path.dirname(__file__), 'vps-update.sh')
            result = subprocess.run(
                ['bash', script_path],
                cwd=APP_DIR,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                logger.info("Deployment completed successfully")
            else:
                logger.error(f"Deployment failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            logger.error("Deployment script timed out")
        except Exception as e:
            logger.error(f"Failed to trigger deployment: {str(e)}")
    
    def log_message(self, format, *args):
        """Override to use custom logger"""
        logger.info(format % args)

def run_server():
    """Start the webhook server"""
    server_address = ('0.0.0.0', WEBHOOK_PORT)
    httpd = HTTPServer(server_address, GitHubWebhookHandler)
    logger.info(f"Webhook server listening on port {WEBHOOK_PORT}")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Webhook server stopped")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
