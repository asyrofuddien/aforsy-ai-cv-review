window.onload = function() {
  const ui = SwaggerUIBundle({
    url: './swagger.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIBundle.presets.standalone
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    // Tidak pakai layout
    tryItOutEnabled: true,
    filter: true,
    supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    validatorUrl: null,
    docExpansion: 'list',
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    displayRequestDuration: true,
    showExtensions: true,
    showCommonExtensions: true,
    onComplete: function() {
      console.log('📖 API Documentation loaded successfully');
    }
  });
  
  // Custom CSS untuk hide topbar
  const style = document.createElement('style');
  style.textContent = `
    .swagger-ui .topbar {
      display: none !important;
    }
    .swagger-ui .info {
      margin-top: 0 !important;
    }
    .swagger-ui .info .title {
      font-size: 36px !important;
      color: #3b4151 !important;
    }
  `;
  document.head.appendChild(style);
};