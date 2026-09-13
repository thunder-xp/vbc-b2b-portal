import { chromium } from "playwright-core";

const baseUrl=process.env.AGENT_ACCEPTANCE_BASE_URL??"http://localhost:3011";
const email=process.env.AGENT_ACCEPTANCE_EMAIL;const password=process.env.AGENT_ACCEPTANCE_PASSWORD;
if(!email||!password)throw new Error("AGENT_ACCEPTANCE_EMAIL and AGENT_ACCEPTANCE_PASSWORD are required.");
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH??"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`${baseUrl}/auth/sign-in?next=%2Fagent`);await page.getByLabel("Электронная почта").fill(email);await page.getByLabel("Пароль").fill(password);await page.getByRole("button",{name:"Войти"}).click();await page.waitForURL(`${baseUrl}/agent`);
  const result={};for(const route of ["/agent","/agent/clients","/agent/referrals","/agent/qr"]){await page.goto(`${baseUrl}${route}`);const samples=[];for(let i=0;i<10;i++){const started=performance.now();const response=await page.goto(`${baseUrl}${route}`);samples.push({duration:performance.now()-started,status:response?.status()});}const values=samples.map(x=>x.duration).sort((a,b)=>a-b);result[route]={p50:Math.round(values[4]),p95:Math.round(values[9]),status:[...new Set(samples.map(x=>x.status))]};}console.log(JSON.stringify(result));
}finally{await browser.close();}
