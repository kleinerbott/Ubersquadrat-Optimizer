import { createApp } from 'vue';
import { createPinia } from 'pinia';

import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import '@mdi/font/css/materialdesignicons.css';

import 'leaflet/dist/leaflet.css';

import App from './App.vue';

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#4CAF50',
          secondary: '#0066ff',
          accent: '#ffd700',
          error: '#ff5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FFC107'
        }
      }
    }
  }
});

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
app.use(vuetify);
app.mount('#app');
