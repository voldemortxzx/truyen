import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { provideServerRendering } from '@angular/platform-server';

const serverAppConfig = {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    provideServerRendering()
  ]
};

export function bootstrap() {
  return bootstrapApplication(App, serverAppConfig);
}
