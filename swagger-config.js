import { APP_IP, APP_PORT } from './env.js';

export const swaggerConfig = {
  routePrefix: '/docs',
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'API Docs',
      description: 'API documentation for the MegaApp',
      version: '1.0.0',
    },
    servers: [
      {
        url: `http://${APP_IP}:${APP_PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  exposeRoute: true,
};

export const swaggerUiConfig = {
  routePrefix: '/docs',
  uiConfig: {
    deepLinking: true,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  transformSpecification: (swaggerObject, request, reply) => {
    return swaggerObject;
  },
  transformSpecificationClone: true,
};
