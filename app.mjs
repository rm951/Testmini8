import {assemble,CPU,SOURCE_NAMES,DESTINATION_NAMES,CONDITION_NAMES,ALU_NAMES,rowToText,textToRows,hex} from "./core.mjs";

const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));

const EXAMPLES={
  "Addition guidée":`CONST 7 -> R0
CONST 8 -> R1
ALU ADD -> R3
HALT`,
  "Mémoire RAM":`CONST 42 -> R0
CONST 200 -> MAR
R0 -> RAM
RAM -> R2
HALT`,
  "Pile PUSH / POP":`CONST 14 -> R0
CONST 99 -> R1
R1 -> PUSH
R0 -> PUSH
POP -> R2
POP -> R3
HALT`,
  "Boucle et condition":`CONST 5 -> R2
BOUCLE:
R2 -> R0
CONST 1 -> R1
ALU SUB -> R2
CONST BOUCLE -> PC IF NZ
HALT`,
  "Factorielle de 5":`CONST 5 -> R0
R0 -> R2
CONST 1 -> R3
R2 -> R0
CONST 0 -> R1
ALU SUB -> R0
CONST END -> PC IF Z
OUTER:
CONST 201 -> MAR
R2 -> RAM
CONST 202 -> MAR
R3 -> RAM
CONST 0 -> R3
INNER:
R3 -> R0
CONST 202 -> MAR
RAM -> R1
ALU ADD -> R3
R2 -> R0
CONST 1 -> R1
ALU SUB -> R2
CONST INNER -> PC IF NZ
CONST 201 -> MAR
RAM -> R0
CONST 1 -> R1
ALU SUB -> R2
CONST OUTER -> PC IF NZ
END:
R3 -> R0
CONST 200 -> MAR
R0 -> RAM
HALT`
};

const SOURCE_HELP={R0:"Registre général 0",R1:"Registre général 1",R2:"Registre général 2",R3:"Registre général 3",RAM:"Lit RAM à l'adresse MAR",ALU:"Calcule avec R0 et R1",POP:"Dépile une valeur",CONST:"Valeur immédiate ou label"};
const DEST_HELP={R0:"Écrit dans R0",R1:"Écrit dans R1",R2:"Écrit dans R2",R3:"Écrit dans R3",MAR:"Choisit l'adresse RAM",RAM:"Écrit à l'adresse MAR",PC:"Effectue un saut",PUSH:"Empile la valeur"};
const NODE_X={r0:10,r1:28,r2:46,r3:64,pc:86,ir:10,mar:28,ram:46,alu:66,sp:86,rom:10,flags:86};

let rows=[];
let mode="visual";
let selectedCondition="ALWAYS";
let editingIndex=null;
let machine=null;
let dirty=true;
let running=false;
let timer=null;
let traceLines=[];
const breakpoints=new Set();

function setStatus(text,type=""){$("status").textContent=text;$("status").className=`status ${type}`.trim();}
function sourceFromRows(){return rows.map(rowToText).join("\n");}
function currentSource(){return mode==="text"?$("editor").value:sourceFromRows();}
function persist(){try{localStorage.setItem("mini8-source-v2",currentSource());}catch{}}
function markDirty(message="Programme modifié -- il sera réassemblé automatiquement."){
  dirty=true;pause();persist();setStatus(message,"dirty");
}

function rowSize(row){return row.type==="halt"||row.src==="CONST"||row.src==="ALU"?2:row.type==="label"?0:1;}
function refreshLabelSuggestions(){
  const labels=rows.filter(row=>row.type==="label").map(row=>row.name);
  $("labelSuggestions").innerHTML=labels.map(label=>`<option value="${escapeHTML(label)}"></option>`).join("");
}
function renderProgramRows(){
  let pc=0;
  if(!rows.length){$("programList").innerHTML='<div class="empty">Programme vide.</div>';refreshLabelSuggestions();return;}
  $("programList").innerHTML=rows.map((row,index)=>{
    const address=pc;pc+=rowSize(row);
    const isLabel=row.type==="label";
    const text=rowToText(row);
    const meta=isLabel?"Label · 0 octet":`${rowSize(row)} octet${rowSize(row)>1?"s":""}`;
    return `<div class="program-row ${isLabel?"label-row":""} ${editingIndex===index?"editing":""}">
      <div class="addr">${hex(address)}</div>
      <div><div class="inst-text">${isLabel?"🏷 ":""}${escapeHTML(text)}</div><div class="inst-meta">${meta}</div></div>
      <div class="row-actions">
        ${!isLabel?`<button data-row-action="edit" data-index="${index}" type="button">Modifier</button><button data-row-action="duplicate" data-index="${index}" type="button">Dupliquer</button>`:""}
        <button data-row-action="up" data-index="${index}" aria-label="Monter" type="button">↑</button>
        <button data-row-action="down" data-index="${index}" aria-label="Descendre" type="button">↓</button>
        <button data-row-action="delete" data-index="${index}" class="danger" type="button">Supprimer</button>
      </div>
    </div>`;
  }).join("");
  refreshLabelSuggestions();
  if(mode==="visual")$("editor").value=sourceFromRows();
}

function fillSelects(){
  $("sourceSelect").innerHTML=SOURCE_NAMES.map(name=>`<option value="${name}">${name}</option>`).join("");
  $("destSelect").innerHTML=DESTINATION_NAMES.map(name=>`<option value="${name}">${name}</option>`).join("");
  $("conditionPills").innerHTML=CONDITION_NAMES.map(name=>`<button type="button" data-condition="${name}" class="${name==="ALWAYS"?"active":""}">${name}</button>`).join("");
}
function updateBuilderFields(preferred=""){
  const source=$("sourceSelect").value;
  $("sourceHelp").textContent=SOURCE_HELP[source];
  [...$("destSelect").options].forEach(option=>option.disabled=(source==="RAM"||source==="POP")&&(option.value==="RAM"||option.value==="PUSH"));
  if($("destSelect").selectedOptions[0]?.disabled)$("destSelect").value="R0";
  $("destHelp").textContent=DEST_HELP[$("destSelect").value];
  $("extraField").classList.toggle("hidden",source!=="CONST"&&source!=="ALU");
  if(source==="CONST"){
    $("extraField").innerHTML=`Constante ou label<input id="extraInput" list="labelSuggestions" autocomplete="off" value="${escapeHTML(preferred||"7")}">`;
    refreshLabelSuggestions();
  }else if(source==="ALU"){
    $("extraField").innerHTML=`Opération ALU<select id="extraInput">${ALU_NAMES.map(name=>`<option ${name===(preferred||"ADD")?"selected":""}>${name}</option>`).join("")}</select>`;
  }
}
function setCondition(value){selectedCondition=value;document.querySelectorAll("[data-condition]").forEach(button=>button.classList.toggle("active",button.dataset.condition===value));}
function cancelEditing(){editingIndex=null;$("saveInstruction").textContent="+ Ajouter l'instruction";$("cancelEdit").classList.add("hidden");renderProgramRows();}
function editRow(index){
  const row=rows[index];
  if(!row||row.type==="label")return;
  if(row.type==="halt"){$("addHalt").focus();return;}
  editingIndex=index;$("sourceSelect").value=row.src;$("destSelect").value=row.dst;setCondition(row.cond);updateBuilderFields(row.extra);
  $("saveInstruction").textContent="Enregistrer la modification";$("cancelEdit").classList.remove("hidden");renderProgramRows();
  $("sourceSelect").scrollIntoView({behavior:"smooth",block:"center"});
}
function saveInstruction(){
  const src=$("sourceSelect").value,dst=$("destSelect").value;
  const extra=(src==="CONST"||src==="ALU")?$("extraInput").value.trim():"";
  if((src==="CONST"||src==="ALU")&&!extra){setStatus("Une valeur ou opération est nécessaire.","err");return;}
  const row={type:"instruction",src,dst,cond:selectedCondition,extra};
  if(editingIndex===null)rows.push(row);else rows[editingIndex]=row;
  cancelEditing();markDirty();renderProgramRows();
}
function addLabel(){
  const name=$("labelInput").value.trim().toUpperCase();
  if(!/^[A-Z_][A-Z0-9_]*$/.test(name)){setStatus("Nom de label invalide.","err");return;}
  if(rows.some(row=>row.type==="label"&&row.name===name)){setStatus(`Le label ${name} existe déjà.`,"err");return;}
  rows.push({type:"label",name});$("labelInput").value="";markDirty();renderProgramRows();
}
function handleRowAction(action,index){
  if(action==="edit"){editRow(index);return;}
  if(action==="duplicate")rows.splice(index+1,0,{...rows[index]});
  if(action==="delete")rows.splice(index,1);
  if(action==="up"&&index>0)[rows[index-1],rows[index]]=[rows[index],rows[index-1]];
  if(action==="down"&&index<rows.length-1)[rows[index+1],rows[index]]=[rows[index],rows[index+1]];
  cancelEditing();markDirty();renderProgramRows();
}

function setMode(next){
  if(next===mode)return;
  if(next==="visual"){
    try{rows=textToRows($("editor").value);}catch(error){setStatus(`${error.message}. Corrige le code avant de revenir aux cartes.`,"err");return;}
    renderProgramRows();
  }else $("editor").value=sourceFromRows();
  mode=next;
  $("visualPane").classList.toggle("hidden",mode!=="visual");$("textPane").classList.toggle("hidden",mode!=="text");
  $("visualTab").classList.toggle("active",mode==="visual");$("textTab").classList.toggle("active",mode==="text");
  $("visualTab").setAttribute("aria-selected",String(mode==="visual"));$("textTab").setAttribute("aria-selected",String(mode==="text"));
}

function renderListing(){
  if(!machine){$("listing").innerHTML="";return;}
  $("listing").innerHTML=machine.program.list.map(item=>`<div class="listing-line ${breakpoints.has(item.a)?"breakpoint":""}" data-address="${item.a}">
    <button type="button" data-breakpoint="${item.a}" aria-label="Point d'arrêt à l'adresse ${hex(item.a)}">${hex(item.a)}</button>
    <span>${item.bytes.map(byte=>`${hex(byte)}/${byte}`).join(" ")}</span><span>${escapeHTML(item.text)}</span>
  </div>`).join("");
}
function renderRegisterStrip(){
  if(!machine){$("registerStrip").innerHTML="";return;}
  const cpu=machine.cpu;
  const changed=cpu.lastEvent?.kind==="write"?cpu.lastEvent.to:null;
  const values=[...cpu.r.map((value,index)=>[`R${index}`,value,`r${index}`]),["MAR",cpu.mar,"mar"],["PC",cpu.pc,"pc"],["SP",cpu.sp,"sp"],["Z",cpu.z,"flags"],["C",cpu.c,"flags"]];
  $("registerStrip").innerHTML=values.map(([name,value,node])=>`<div class="register ${changed===node?"changed":""}"><span class="name">${name}</span><strong>${value}</strong><small>0x${hex(value)}</small></div>`).join("");
}
function renderMemory(){
  if(!machine)return;
  const cpu=machine.cpu;
  const start=cpu.mar&0xF0;
  $("memoryView").innerHTML=Array.from({length:16},(_,offset)=>{
    const address=(start+offset)&255;
    return `<div class="memory-cell ${address===cpu.mar?"pointed":""} ${address===cpu.lastMemoryWrite?"written":""}"><span class="memory-address">${hex(address)}</span><strong>${cpu.ram[address]}</strong><small>0x${hex(cpu.ram[address])}</small></div>`;
  }).join("");
  const stackAddresses=Array.from({length:8},(_,offset)=>(cpu.sp-3+offset)&255);
  $("stackView").innerHTML=stackAddresses.map(address=>`<div class="memory-cell ${address===cpu.lastMemoryWrite?"written":""} ${address===((cpu.sp+1)&255)?"stack-top":""}"><span class="memory-address">${hex(address)}</span><strong>${cpu.ram[address]}</strong><small>${address===cpu.sp?"← SP":address===((cpu.sp+1)&255)?"sommet":"0x"+hex(cpu.ram[address])}</small></div>`).join("");
}
function renderDatapath(){
  if(!machine)return;
  const cpu=machine.cpu,event=cpu.lastEvent;
  document.querySelectorAll(".cpu-node").forEach(node=>node.classList.remove("source","destination","computing"));
  document.querySelectorAll(".wire").forEach(wire=>wire.classList.remove("active-source","active-destination"));
  $("dataBus").classList.toggle("active",!!event?.bus);
  $("busValue").textContent=event?.bus&&event.value!==null?`${event.value} · 0x${hex(event.value)}`:"BUS libre";
  if(event?.from){document.querySelector(`[data-node="${event.from}"]`)?.classList.add(event.kind==="compute"?"computing":"source");document.querySelector(`[data-wire="${event.from}"]`)?.classList.add("active-source");}
  if(event?.to){document.querySelector(`[data-node="${event.to}"]`)?.classList.add("destination");document.querySelector(`[data-wire="${event.to}"]`)?.classList.add("active-destination");}
  const targetX=NODE_X[event?.to]??NODE_X[event?.from]??50;$("busValue").style.left=`${targetX}%`;
  cpu.r.forEach((value,index)=>{document.querySelector(`[data-node="r${index}"] small`).textContent=`${value} · 0x${hex(value)}`;});
  document.querySelector('[data-node="pc"] small').textContent=`${cpu.pc} · 0x${hex(cpu.pc)}`;
  document.querySelector('[data-node="mar"] small').textContent=`${cpu.mar} · 0x${hex(cpu.mar)}`;
  document.querySelector('[data-node="sp"] small').textContent=`${cpu.sp} · 0x${hex(cpu.sp)}`;
  $("ramNodeValue").textContent=`RAM[${cpu.mar}] = ${cpu.ram[cpu.mar]}`;
  $("flagsValue").textContent=`Z=${cpu.z} · C=${cpu.c}`;
  $("irValue").textContent=event?.instruction?event.instruction.bytes.map(byte=>hex(byte)).join(" "):"--";
  $("romValue").textContent=event?.kind==="fetch"?`adresse 0x${hex(event.p0)}`:"lecture opcode";
  $("aluOperation").textContent=event?.operation||"--";
  $("aluA").textContent=`A: ${cpu.aluA??"--"}`;$("aluB").textContent=`B: ${cpu.aluB??"--"}`;$("aluResult").textContent=`résultat: ${cpu.aluResult??"--"}`;
  $("aluA").classList.toggle("filled",cpu.aluA!==null);$("aluB").classList.toggle("filled",cpu.aluB!==null);
  $("phaseBadge").textContent=event?.kind?.toUpperCase()||"PRÊT";$("microExplanation").textContent=event?.description||'Assemble puis utilise "Micro-pas" pour voir chaque transfert.';
  const entry=event?.instruction||machine.program.byAddress.get(cpu.pc);$("instructionLabel").textContent=entry?`0x${hex(entry.a)} · ${entry.text}`:cpu.halted?cpu.haltReason:"Aucune instruction en cours";
  $("cycleCount").textContent=cpu.cycles;$("microCount").textContent=cpu.microCycles;
  document.querySelectorAll(".listing-line").forEach(line=>line.classList.toggle("current",Number(line.dataset.address)===(event?.p0??cpu.pc)));
}
function renderAll(){renderRegisterStrip();renderDatapath();renderMemory();}

function appendTrace(event){
  if(!event)return;
  const bus=event.bus?` · bus=${event.value}/0x${hex(event.value)}`:"";
  traceLines.push(`#${machine.cpu.microCycles} PC=${hex(event.p0??machine.cpu.pc)} ${event.kind.toUpperCase()}${bus} · ${event.description}`);
  traceLines=traceLines.slice(-100);$("trace").textContent=traceLines.join("\n");$("trace").scrollTop=$("trace").scrollHeight;
}
function assembleUI(){
  pause();
  try{
    const source=currentSource();const program=assemble(source);machine={program,cpu:new CPU(program)};dirty=false;traceLines=[];$("trace").textContent="";
    if(mode==="text"){rows=textToRows(source);}else $("editor").value=source;
    renderListing();renderAll();persist();setStatus(`Assemblé: ${program.used} octets, ${program.list.length} instructions.`,"ok");return true;
  }catch(error){setStatus(error.message,"err");return false;}
}
function ensureAssembled(){return !dirty&&machine?true:assembleUI();}
function microStep({fromRun=false}={}){
  if(!fromRun)pause();if(!ensureAssembled())return null;
  const cpu=machine.cpu;
  if(cpu.halted){if(fromRun)pause();setStatus(cpu.haltReason,"ok");return cpu.lastEvent;}
  const event=cpu.microStep();appendTrace(event);renderAll();
  if(cpu.halted){pause();setStatus(`${cpu.haltReason} après ${cpu.cycles} instructions et ${cpu.microCycles} microcycles.`,"ok");}
  return event;
}
function instructionStep(){
  pause();if(!ensureAssembled())return;
  const events=machine.cpu.stepInstruction();events.forEach(appendTrace);renderAll();
  if(machine.cpu.halted)setStatus(`${machine.cpu.haltReason} après ${machine.cpu.cycles} instructions.`,"ok");
  else setStatus(`Instruction terminée. PC=0x${hex(machine.cpu.pc)}.`,"ok");
}
function resetCPU(){pause();if(!ensureAssembled())return;machine.cpu.reset();traceLines=[];$("trace").textContent="";renderAll();setStatus("Processeur réinitialisé.","ok");}
function pause(){if(timer)clearInterval(timer);timer=null;running=false;document.querySelectorAll('[data-action="run"]').forEach(button=>button.textContent="Exécuter");}
function runToggle(){
  if(running){pause();setStatus("Exécution en pause.");return;}
  if(!ensureAssembled())return;
  running=true;document.querySelectorAll('[data-action="run"]').forEach(button=>button.textContent="Pause");setStatus("Exécution animée en cours...","ok");
  const tick=()=>{
    if(!running)return;
    if(!machine.cpu.plan&&breakpoints.has(machine.cpu.pc)){pause();setStatus(`Point d'arrêt atteint à 0x${hex(machine.cpu.pc)}.`,"dirty");return;}
    microStep({fromRun:true});
  };
  timer=setInterval(tick,Number($("speedSelect").value));tick();
}

function loadExample(name){
  const source=EXAMPLES[name];if(!source)return;
  try{rows=textToRows(source);$("editor").value=source;mode="visual";$("visualPane").classList.remove("hidden");$("textPane").classList.add("hidden");$("visualTab").classList.add("active");$("textTab").classList.remove("active");renderProgramRows();markDirty(`Exemple "${name}" chargé.`);assembleUI();}catch(error){setStatus(error.message,"err");}
}

function bindEvents(){
  $("sourceSelect").addEventListener("change",()=>updateBuilderFields());$("destSelect").addEventListener("change",()=>$("destHelp").textContent=DEST_HELP[$("destSelect").value]);
  $("saveInstruction").addEventListener("click",saveInstruction);$("cancelEdit").addEventListener("click",cancelEditing);$("addLabel").addEventListener("click",addLabel);
  $("addHalt").addEventListener("click",()=>{rows.push({type:"halt"});markDirty();renderProgramRows();});
  $("visualTab").addEventListener("click",()=>setMode("visual"));$("textTab").addEventListener("click",()=>setMode("text"));
  $("editor").addEventListener("input",()=>markDirty());$("exampleSelect").addEventListener("change",event=>loadExample(event.target.value));
  $("speedSelect").addEventListener("change",()=>{if(running){pause();runToggle();}});$("clearTrace").addEventListener("click",()=>{traceLines=[];$("trace").textContent="";});
  document.addEventListener("click",event=>{
    const condition=event.target.dataset.condition;if(condition)setCondition(condition);
    const action=event.target.dataset.action;if(action==="assemble")assembleUI();if(action==="reset")resetCPU();if(action==="micro")microStep();if(action==="instruction")instructionStep();if(action==="run")runToggle();
    const rowAction=event.target.dataset.rowAction;if(rowAction)handleRowAction(rowAction,Number(event.target.dataset.index));
    if(event.target.dataset.breakpoint!==undefined){const address=Number(event.target.dataset.breakpoint);if(breakpoints.has(address))breakpoints.delete(address);else breakpoints.add(address);renderListing();renderDatapath();}
  });
}

function init(){
  fillSelects();updateBuilderFields();
  $("exampleSelect").innerHTML='<option value="">Choisir...</option>'+Object.keys(EXAMPLES).map(name=>`<option>${escapeHTML(name)}</option>`).join("");
  let saved="";try{saved=localStorage.getItem("mini8-source-v2")||"";}catch{}
  const source=saved||EXAMPLES["Addition guidée"];
  try{rows=textToRows(source);}catch{rows=textToRows(EXAMPLES["Addition guidée"]);}
  $("editor").value=sourceFromRows();renderProgramRows();bindEvents();assembleUI();
}

init();
