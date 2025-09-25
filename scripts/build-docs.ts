import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface PostmanCollection {
  info: {
    name: string;
    description: string;
  };
  item: any[];
}

interface OpenAPIPath {
  [method: string]: {
    summary: string;
    description: string;
    tags: string[];
    responses: any;
    requestBody?: any;
    parameters?: any[];
  };
}

function buildDocs(): void {
  try {
    console.log('🔄 Building documentation...');

    setupAssets();

    // Read postman collection
    const postmanPath = path.join(__dirname, '../postman-collection.json');
    if (!fs.existsSync(postmanPath)) {
      console.error('❌ postman-collection.json not found!');
      return;
    }

    const postmanCollection: PostmanCollection = JSON.parse(
      fs.readFileSync(postmanPath, 'utf8')
    );

    // Create OpenAPI spec from postman
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: postmanCollection.info.name || 'CV Evaluation API',
        description: postmanCollection.info.description || 'API Documentation',
        version: '1.0.0',
      },
      servers: [
        {
          url: '/api',
          description: 'Current Environment',
        },
      ],
      paths: convertPostmanToPaths(postmanCollection),
      components: {
        schemas: {
          JobDescription: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              slug: { type: 'string' },
              title: { type: 'string' },
              company: { type: 'string' },
              description: { type: 'string' },
              requirements: {
                type: 'object',
                properties: {
                  technical: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  soft_skills: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
              isDefault: { type: 'boolean' },
            },
          },
          EvaluationResult: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: {
                type: 'string',
                enum: ['queued', 'processing', 'completed', 'failed'],
              },
              result: {
                type: 'object',
                properties: {
                  cv_match_rate: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                  },
                  cv_feedback: { type: 'string' },
                  project_score: {
                    type: 'number',
                    minimum: 0,
                    maximum: 10,
                  },
                  project_feedback: { type: 'string' },
                  overall_summary: { type: 'string' },
                },
              },
            },
          },
        },
      },
    };

    // Ensure docs directory exists
    const docsDir = path.join(__dirname, '../public/docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Convert to YAML and save
    const yamlStr = yaml.dump(openApiSpec, {
      lineWidth: -1,
      noRefs: true,
    });

    fs.writeFileSync(path.join(docsDir, 'swagger.yaml'), yamlStr);

    console.log('✅ swagger.yaml generated successfully!');
  } catch (error) {
    console.error('❌ Error building docs:', error);
    process.exit(1);
  }
}

function convertPostmanToPaths(
  collection: PostmanCollection
): Record<string, OpenAPIPath> {
  const paths: Record<string, OpenAPIPath> = {};

  if (collection.item) {
    collection.item.forEach((folder: any) => {
      if (folder.item) {
        folder.item.forEach((request: any) => {
          if (request.request) {
            const method = request.request.method.toLowerCase();
            const url = extractPath(request.request.url);

            if (!paths[url]) {
              paths[url] = {};
            }

            // Base path info
            paths[url][method] = {
              summary: request.name,
              description: request.request.description || request.name,
              tags: [folder.name.replace(/[📋💼📤🔄📊🛠️🚀❌]/g, '').trim()],
              responses: {
                '200': {
                  description: 'Successful response',
                  content: {
                    'application/json': {
                      schema: { type: 'object' },
                    },
                  },
                },
              },
            };

            // Add path parameters
            const pathParams = extractPathParameters(url);
            if (pathParams.length > 0) {
              paths[url][method].parameters = pathParams;
            }

            // Add query parameters
            if (request.request.url?.query) {
              const queryParams = request.request.url.query.map(
                (param: any) => ({
                  name: param.key,
                  in: 'query',
                  schema: { type: 'string' },
                  description: param.description || param.key,
                  required: false,
                })
              );
              paths[url][method].parameters = [
                ...(paths[url][method].parameters || []),
                ...queryParams,
              ];
            }

            // Add request body for JSON
            if (request.request.body?.mode === 'raw') {
              try {
                const bodyExample = JSON.parse(request.request.body.raw);
                paths[url][method].requestBody = {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        example: bodyExample,
                      },
                    },
                  },
                };
              } catch (e) {
                // Ignore invalid JSON
              }
            }

            // Add form data for file uploads
            if (request.request.body?.mode === 'formdata') {
              const formData = request.request.body.formdata;
              const properties: Record<string, any> = {};
              const required: string[] = [];

              formData.forEach((field: any) => {
                if (field.type === 'file') {
                  properties[field.key] = {
                    type: 'string',
                    format: 'binary',
                    description: field.description || `${field.key} file`,
                  };
                } else {
                  properties[field.key] = {
                    type: 'string',
                    description: field.description || field.key,
                  };
                }

                if (
                  field.description?.includes('required') ||
                  ['cv', 'project'].includes(field.key)
                ) {
                  required.push(field.key);
                }
              });

              paths[url][method].requestBody = {
                required: true,
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties,
                      required: required.length > 0 ? required : undefined,
                    },
                  },
                },
              };
            }

            // Set specific response codes based on method
            if (method === 'post' && url.includes('job-descriptions')) {
              paths[url][method].responses = {
                '201': {
                  description: 'Created successfully',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: { $ref: '#/components/schemas/JobDescription' },
                        },
                      },
                    },
                  },
                },
              };
            } else if (method === 'post' && url.includes('evaluate')) {
              paths[url][method].responses = {
                '202': {
                  description: 'Evaluation started',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          status: { type: 'string', enum: ['queued'] },
                        },
                      },
                    },
                  },
                },
              };
            }
          }
        });
      }
    });
  }

  return paths;
}

function extractPath(url: any): string {
  if (typeof url === 'string') {
    return url.replace('{{baseUrl}}', '').replace(/\?.*$/, '');
  }

  if (url && url.path) {
    let path = '/' + url.path.join('/');
    // Convert {{variable}} to {variable} for OpenAPI
    path = path.replace(/\{\{(\w+)\}\}/g, '{$1}');
    return path;
  }

  return '/';
}

function extractPathParameters(path: string): any[] {
  const matches = path.match(/\{(\w+)\}/g);
  if (!matches) return [];

  return matches.map((match) => {
    const paramName = match.slice(1, -1);
    return {
      name: paramName,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: `${paramName} identifier`,
    };
  });
}

function setupAssets(): void {
  const assetsDir = path.join(__dirname, '../public/docs/assets');
  const swaggerUiPath = path.join(__dirname, '../node_modules/swagger-ui-dist');

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const assetsToCopy = [
    'swagger-ui-bundle.js',
    'swagger-ui.css',
    'favicon-32x32.png',
  ];

  assetsToCopy.forEach((asset) => {
    const srcPath = path.join(swaggerUiPath, asset);
    const destPath = path.join(assetsDir, asset);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

buildDocs();
