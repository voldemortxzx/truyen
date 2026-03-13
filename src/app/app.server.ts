import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { App } from './app';
import { provideServerRendering } from '@angular/platform-server';

export const serverAppConfig = {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    provideServerRendering()
  ]
};

export function bootstrap() {
  return bootstrapApplication(App, serverAppConfig);
}

export default bootstrap;
