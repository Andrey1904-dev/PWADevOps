import {defineConfig,devices} from '@playwright/test';
const repo=process.env.GITHUB_REPOSITORY?.split('/')[1];const base=repo&&!repo.endsWith('.github.io')?`/${repo}/`:'/';
export default defineConfig({testDir:'e2e',fullyParallel:false,webServer:{command:'npm run preview -- --port 5173',url:`http://127.0.0.1:5173${base}`,reuseExistingServer:!process.env.CI},use:{baseURL:`http://127.0.0.1:5173${base}`},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}]});
