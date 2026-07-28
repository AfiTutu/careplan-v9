(()=>{"use strict";
try{
  const ROOT_ID="cp-safe-onboarding";
  const TOUR_STATUS_KEY="careplan:onboarding:v1";
  const CAREPLAN_STORAGE_KEY="careplan-v99:local";

  /* Add image:"/onboarding/images/your-image.png" to any step later. */
  const steps=[
    {title:"Your CarePlan home",text:"See today’s care, meals, medicines and upcoming plans at a glance."},
    {title:"Create the patient profile",text:"Start with the patient’s basic details, diagnosis and important care information."},
    {title:"Add caregivers",text:"Add the people who help with care so they are included in the full handover."},
    {title:"Add hospitals and care centres",text:"Save hospitals, departments, consultants and record numbers in one place."},
    {title:"Protect your CarePlan data",text:"Use Data & PWA to install the app and download an encrypted backup regularly."},
    {title:"Build your Care Library",text:"Save reusable routines and instructions here. Add them to the daily plan whenever needed."},
    {title:"Build your Meal Library",text:"Save meals, drinks and feeding notes here for quick and consistent planning."},
    {title:"Use the unified calendar",text:"See all care items together. Print it or download an ICS file to add everything to your own calendar."},
    {title:"Prepare an SOS handover",text:"CarePlan gathers essential patient, caregiver, hospital and medicine details into one clear handover for urgent situations."},
    {title:"Plan & keep records",text:"Add appointments, prepare grocery lists and record important daily observations in logs."},
    {title:"That’s it!",text:"May Allah ease everything for you & your loved one ☺️ — AFI"}
  ];

  let root,layer,card,launcher,index=0,open=false;

  const escapeHtml=value=>String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  function readTourStatus(){
    try{return localStorage.getItem(TOUR_STATUS_KEY)||""}catch(_){return ""}
  }

  function saveTourStatus(status){
    try{localStorage.setItem(TOUR_STATUS_KEY,status)}catch(_){}
  }

  function nonEmpty(value){
    return typeof value==="string" && value.trim()!=="" && value.trim().toLowerCase()!=="patient";
  }

  function hasMeaningfulCarePlanData(){
    try{
      const raw=localStorage.getItem(CAREPLAN_STORAGE_KEY);
      if(!raw)return false;

      const data=JSON.parse(raw);
      if(!data || typeof data!=="object")return false;

      const patient=data.patient||{};
      const patientHasData=[
        patient.legalName,patient.dob,patient.sex,patient.blood,patient.address,
        patient.primaryDx,patient.secondaryDx,patient.allergies,patient.feeding,
        patient.communication,patient.mobility,patient.emergencyNotes
      ].some(nonEmpty);

      if(patientHasData)return true;

      const collectionKeys=[
        "caregivers","hospitals","emergencyContacts","routines","therapies",
        "mealAssignments","mealLibrary","groceries","groceryLibrary",
        "medications","administrations","appointments","logs","completions",
        "routineLibrary","therapyLibrary","externalLinks"
      ];

      if(collectionKeys.some(key=>Array.isArray(data[key])&&data[key].length>0))return true;

      if(data.meals && typeof data.meals==="object"){
        if(Object.values(data.meals).some(day=>Array.isArray(day)&&day.length>0))return true;
      }

      const safety=data.safetyAtGlance||{};
      if(Object.values(safety).some(nonEmpty))return true;

      return false;
    }catch(_){
      /* A damaged or unknown record should not trigger onboarding over user data. */
      return true;
    }
  }

  function shouldAutoOpen(){
    return !readTourStatus() && !hasMeaningfulCarePlanData();
  }

  function mount(){
    if(document.getElementById(ROOT_ID))return;

    root=document.createElement("div");
    root.id=ROOT_ID;
    root.innerHTML=`
      <button class="cp-ob-launcher" type="button" aria-label="Open CarePlan guide" title="Open CarePlan guide">?</button>
      <div class="cp-ob-layer" hidden>
        <div class="cp-ob-backdrop"></div>
        <section class="cp-ob-card" role="dialog" aria-modal="true" aria-labelledby="cp-ob-title">
          <div class="cp-ob-head">
            <span class="cp-ob-kicker"></span>
            <button class="cp-ob-close" type="button" aria-label="Close guided tour">Close</button>
          </div>
          <div class="cp-ob-content"></div>
        </section>
      </div>`;

    document.body.appendChild(root);
    launcher=root.querySelector(".cp-ob-launcher");
    layer=root.querySelector(".cp-ob-layer");
    card=root.querySelector(".cp-ob-card");

    launcher.addEventListener("click",showWelcome);
    root.querySelector(".cp-ob-close").addEventListener("click",()=>closeTour("dismissed"));
    layer.querySelector(".cp-ob-backdrop").addEventListener("click",()=>closeTour("dismissed"));

    document.addEventListener("keydown",event=>{
      if(!open)return;
      if(event.key==="Escape")closeTour("dismissed");
      if(event.key==="ArrowRight")card.querySelector(".cp-ob-next:not(:disabled)")?.click();
      if(event.key==="ArrowLeft")card.querySelector(".cp-ob-prev:not(:disabled)")?.click();
    });
  }

  function openLayer(){
    open=true;
    layer.hidden=false;
    document.documentElement.classList.add("cp-ob-is-open");
  }

  function showWelcome(){
    openLayer();
    root.querySelector(".cp-ob-kicker").textContent="Guided tour";
    root.querySelector(".cp-ob-content").innerHTML=`
      <div class="cp-ob-welcome">
        <div class="cp-ob-mark" aria-hidden="true">♡</div>
        <h2 id="cp-ob-title">CarePlan<span>Specialcare</span></h2>
        <p>A simple way to organise care, meals and important records.</p>
        <button class="cp-ob-start" type="button">Show me around</button>
      </div>`;

    const start=card.querySelector(".cp-ob-start");
    start.addEventListener("click",()=>showStep(0));
    start.focus({preventScroll:true});
  }

  function imageMarkup(step){
    if(!step.image)return "";
    return `<figure class="cp-ob-image-wrap">
      <img class="cp-ob-image" src="${escapeHtml(step.image)}" alt="${escapeHtml(step.imageAlt||step.title)}">
    </figure>`;
  }

  function showStep(nextIndex){
    openLayer();
    index=Math.max(0,Math.min(steps.length-1,nextIndex));
    const step=steps[index];

    root.querySelector(".cp-ob-kicker").textContent=`Step ${index+1} of ${steps.length}`;
    root.querySelector(".cp-ob-content").innerHTML=`
      ${imageMarkup(step)}
      <h2 id="cp-ob-title">${escapeHtml(step.title)}</h2>
      <p>${escapeHtml(step.text)}</p>
      <div class="cp-ob-actions">
        <button class="cp-ob-button cp-ob-prev" type="button"${index===0?" disabled":""}>← Previous</button>
        <div class="cp-ob-progress" aria-label="Tour progress">
          ${steps.map((_,n)=>`<span class="cp-ob-dot${n===index?" is-active":""}"></span>`).join("")}
        </div>
        <button class="cp-ob-button cp-ob-next" type="button">${index===steps.length-1?"Finish":"Next →"}</button>
      </div>`;

    card.querySelector(".cp-ob-prev").addEventListener("click",()=>showStep(index-1));
    const next=card.querySelector(".cp-ob-next");
    next.addEventListener("click",()=>index===steps.length-1?closeTour("completed"):showStep(index+1));
    next.focus({preventScroll:true});
  }

  function closeTour(status="dismissed"){
    open=false;
    layer.hidden=true;
    document.documentElement.classList.remove("cp-ob-is-open");
    saveTourStatus(status);
    launcher.focus({preventScroll:true});
  }

  window.CarePlanOnboarding={
    open:showWelcome,
    start:()=>showStep(0),
    close:()=>closeTour("dismissed"),
    reset:()=>{
      try{localStorage.removeItem(TOUR_STATUS_KEY)}catch(_){}
      showWelcome();
    },
    hasMeaningfulData:hasMeaningfulCarePlanData
  };

  const start=()=>{
    try{
      mount();
      if(shouldAutoOpen())setTimeout(showWelcome,800);
    }catch(error){
      console.error("CarePlan onboarding launcher failed safely:",error);
    }
  };

  if(document.readyState==="complete")setTimeout(start,500);
  else window.addEventListener("load",()=>setTimeout(start,500),{once:true});
}catch(error){
  console.error("CarePlan onboarding disabled safely:",error);
}
})();
