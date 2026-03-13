import 'zone.js/node';
import { CommonEngine } from '@nguniversal/common/engines/common.engine';
import * as express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import bootstrap from './src/main.server';

// The Express app is exported so that it can be used by serverless environments
export function app(): express.Express {
  const server = express();
  const distFolder = join(dirname(fileURLToPath(import.meta.url)), 'dist/web/browser');
  const engine = new CommonEngine();

  server.engine('html', engine.render.bind(engine));
  server.set('view engine', 'html');
  server.set('views', distFolder);

  // Serve static files from /dist/web/browser
  server.get('*.*', express.static(distFolder, { maxAge: '1y' }));

  // All regular routes use the Universal engine
  server.get('*', (req: express.Request, res: express.Response) => {
    res.render('index', { req, providers: [{ provide: 'REQUEST', useValue: req }] });
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;
  const server = app();

  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
