const initialInput=document.getElementById('initialInvestment');
const withdrawalInput=document.getElementById('withdrawalAmount');
const profitSlider=document.getElementById('profitSlider');

const durationInput=document.getElementById('durationValue');
const freqOpts=document.querySelectorAll('.freq-opt');
const unitBtns=document.querySelectorAll('.unit-btn');
let selectedUnit='days';
const calcBtn=document.getElementById('calculateBtn');

const initialDisplay=document.getElementById('initialDisplay');
const withdrawalDisplay=document.getElementById('withdrawalDisplay');
const profitDisplay=document.getElementById('profitDisplay');

const durationDisplay=document.getElementById('durationDisplay');

const emptyState=document.getElementById('emptyState');
const resultsContent=document.getElementById('resultsContent');
const resFinal=document.getElementById('resFinal');
const resProfit=document.getElementById('resProfit');
const resWithdrawn=document.getElementById('resWithdrawn');
const resCycles=document.getElementById('resCycles');
const resGrowth=document.getElementById('resGrowth');
const rewardMoney=document.getElementById('rewardMoney');
const stopLossDisplay=document.getElementById('stopLossDisplay');
const slSlider=document.getElementById('slSlider');
const lossMoney=document.getElementById('lossMoney');

function fmt(n){return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtRs(n){return'\u20B9'+fmt(n)}

let slDisplayed=6.0,slTarget=6.0,slRAF=null;
function slChase(){
const diff=slTarget-slDisplayed;
if(Math.abs(diff)<0.01){slDisplayed=slTarget;stopLossDisplay.textContent=slTarget.toFixed(1)+'%';slSlider.value=slTarget;slRAF=null;return}
slDisplayed+=diff*0.15;stopLossDisplay.textContent=slDisplayed.toFixed(1)+'%';slSlider.value=slDisplayed;slRAF=requestAnimationFrame(slChase);
}

function getTotalDays(){
const dur=+durationInput.value||0;
if(dur<=0)return 0;
if(selectedUnit==='weeks')return dur*6;
if(selectedUnit==='months')return dur*30-Math.floor(dur*30/7);
if(selectedUnit==='years')return dur*365-Math.floor(dur*365/7);
return dur;
}

function updateMoney(){
const inv=+initialInput.value||0;
const pct=+profitSlider.value;
const totalDays=getTotalDays();
const dailyGain=inv*pct/100;
const sl=pct/2;
const cycleLen=selectedUnit==='days'||selectedUnit==='weeks'?1:selectedUnit==='months'?6:30-Math.floor(30/7);
const lossPerCycle=inv*sl/100;
rewardMoney.textContent=fmtRs(dailyGain*totalDays);
lossMoney.textContent=fmtRs(lossPerCycle*Math.floor((totalDays/cycleLen)||0));
}

function updateDisplays(){
initialDisplay.textContent=fmtRs(+initialInput.value||0);
withdrawalDisplay.textContent=fmtRs(+withdrawalInput.value||0);
profitDisplay.textContent=profitSlider.value+'%';
slTarget=+profitSlider.value/2;
if(!slRAF)slRAF=requestAnimationFrame(slChase);
updateMoney();
updateDurationDisplay();
}

function getFreqForUnit(unit){
if(unit==='days'||unit==='weeks')return'daily';
if(unit==='months')return'weekly';
return'monthly';
}

function updateDurationDisplay(){
const val=+durationInput.value||0;
const labels={days:'Day',weeks:'Week',months:'Month',years:'Year'};
const label=labels[selectedUnit]||'Week';
durationDisplay.textContent=val+' '+label+(val!==1?'s':'');
const activeFreq=getFreqForUnit(selectedUnit);
freqOpts.forEach(el=>{
el.classList.toggle('active',el.dataset.freq===activeFreq);
});
}

unitBtns.forEach(btn=>{
btn.addEventListener('click',()=>{
unitBtns.forEach(b=>b.classList.remove('active'));
btn.classList.add('active');
selectedUnit=btn.dataset.value;
updateDurationDisplay();
updateMoney();
calculate();
});
});

initialInput.addEventListener('blur',()=>{
if(+initialInput.value<500)initialInput.value=500;
updateDisplays();
});
initialInput.addEventListener('input',updateDisplays);
withdrawalInput.addEventListener('input',updateDisplays);
profitSlider.addEventListener('input',updateDisplays);

durationInput.addEventListener('input',()=>{updateDurationDisplay();updateMoney();});

updateDisplays();

function calculate(){
const initial=+initialInput.value||0;
const withdrawal=+withdrawalInput.value||0;
const profitPct=+profitSlider.value;
const dur=+durationInput.value||0;

if(initial<500||dur<=0)return;

let totalDays=dur;
if(selectedUnit==='weeks'){
totalDays*=6;
}else if(selectedUnit==='months'){
totalDays=dur*30-Math.floor(dur*30/7);
}else if(selectedUnit==='years'){
totalDays=dur*365-Math.floor(dur*365/7);
}

const freq=getFreqForUnit(selectedUnit);
const cycleLen=freq==='daily'?1:freq==='weekly'?6:30-Math.floor(30/7);
const dailyRate=profitPct/100;
let balance=initial;
let totalProfit=0;
let totalWithdrawn=0;
let cycles=0;

for(let day=1;day<=totalDays;day++){
const gain=initial*dailyRate;
balance+=gain;
totalProfit+=gain;

if(day%cycleLen===0){
if(balance>=withdrawal&&withdrawal>0){
balance-=withdrawal;
totalWithdrawn+=withdrawal;
cycles++;
}else if(balance>0&&withdrawal>0){
totalWithdrawn+=balance;
balance=0;
cycles++;
break;
}
}
}

const netGrowth=initial>0?((balance+totalWithdrawn-initial)/initial)*100:0;

emptyState.style.display='none';
resultsContent.style.display='block';

resFinal.textContent=fmtRs(balance);
resProfit.textContent=fmtRs(totalProfit);
resWithdrawn.textContent=fmtRs(totalWithdrawn);
resCycles.textContent=cycles.toLocaleString();
resGrowth.textContent=fmt(netGrowth)+'%';
}

calcBtn.addEventListener('click',calculate);
document.addEventListener('keydown',e=>{
if(e.key==='Enter'&&e.target.closest('.card'))calculate();
});

calculate();

// Pre-Register
const preregBtn=document.getElementById('preregBtn');
const preregInput=document.getElementById('preregEmail');
const preregCoupon=document.getElementById('preregCoupon');
const popupOverlay=document.getElementById('popupOverlay');
const popupClose=document.getElementById('popupClose');

popupClose.addEventListener('click',()=>popupOverlay.classList.remove('active'));
popupOverlay.addEventListener('click',e=>{if(e.target===popupOverlay)popupOverlay.classList.remove('active')});

function showPopup(){
popupOverlay.classList.add('active');
preregBtn.textContent='Registered!';
preregBtn.style.background='linear-gradient(135deg,#00e676,#00c853)';
preregBtn.disabled=true;
preregInput.disabled=true;
preregCoupon.disabled=true;
preregInput.style.opacity='0.5';
preregCoupon.style.opacity='0.5';
}

function setError(msg){
preregInput.style.borderColor='#ff4757';
preregBtn.textContent=msg;
setTimeout(()=>{preregBtn.textContent='Pre-Register Free';preregInput.style.borderColor='rgba(255,255,255,0.12)'},2500);
}

function setCouponError(msg){
preregCoupon.style.borderColor='#ff4757';
preregBtn.textContent=msg;
setTimeout(()=>{preregBtn.textContent='Pre-Register Free';preregCoupon.style.borderColor='rgba(255,255,255,0.12)'},2500);
}

preregBtn.addEventListener('click',async()=>{
const email=preregInput.value.trim();
const coupon=preregCoupon.value.trim().toUpperCase();

if(!email||!email.includes('@')||!email.includes('.')){
preregInput.style.borderColor='#ff4757';
preregInput.focus();
return;
}
preregInput.style.borderColor='rgba(255,255,255,0.12)';

if(!coupon){
preregCoupon.style.borderColor='#ff4757';
preregCoupon.focus();
return;
}
preregCoupon.style.borderColor='rgba(255,255,255,0.12)';

preregBtn.textContent='Submitting...';
preregBtn.disabled=true;
try{
const body={email,coupon_code:coupon};
const r=await fetch('/api/preregister',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const data=await r.json();
if(r.ok){
showPopup();
}else{
setError(data.error||'Error');
preregBtn.disabled=false;
}
}catch(e){
setError('Connection error');
preregBtn.disabled=false;
}
});
