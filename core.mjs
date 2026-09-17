export const SOURCES={R0:0,R1:1,R2:2,R3:3,RAM:4,ALU:5,POP:6,CONST:7};
export const DESTINATIONS={R0:0,R1:1,R2:2,R3:3,MAR:4,RAM:5,PC:6,PUSH:7};
export const CONDITIONS={ALWAYS:0,Z:1,NZ:2,C:3};
export const ALU_OPS={ADD:0,SUB:1,AND:2,OR:3,XOR:4,SHL:5,SHR:6,NOT:7};
export const SOURCE_NAMES=Object.keys(SOURCES);
export const DESTINATION_NAMES=Object.keys(DESTINATIONS);
export const CONDITION_NAMES=Object.keys(CONDITIONS);
export const ALU_NAMES=Object.keys(ALU_OPS);

export const hex=value=>(value&255).toString(16).toUpperCase().padStart(2,"0");

function cleanLine(line){
  const semi=line.indexOf(";");
  const hash=line.indexOf("#");
  const cuts=[semi,hash].filter(x=>x>=0);
  return line.slice(0,cuts.length?Math.min(...cuts):line.length).trim();
}

function splitCondition(text,lineNumber){
  const match=text.match(/\s+IF\s+(ALWAYS|Z|NZ|C)\s*$/i);
  if(/\s+IF\s+/i.test(text)&&!match)throw Error(`Ligne ${lineNumber}: condition inconnue`);
  return {body:match?text.slice(0,match.index).trim():text,condition:match?match[1].toUpperCase():"ALWAYS"};
}

function parseNumber(token,labels,lineNumber){
  const text=token.trim();
  const upper=text.toUpperCase();
  if(Object.prototype.hasOwnProperty.call(labels,upper))return labels[upper];
  let value;
  if(/^0x[0-9a-f]+$/i.test(text))value=Number.parseInt(text.slice(2),16);
  else if(/^0b[01]+$/i.test(text))value=Number.parseInt(text.slice(2),2);
  else if(/^\d+$/.test(text))value=Number(text);
  else throw Error(`Ligne ${lineNumber}: valeur ou label inconnu "${text}"`);
  if(!Number.isInteger(value)||value<0||value>255)throw Error(`Ligne ${lineNumber}: valeur hors plage 0-255`);
  return value;
}

function consumeLabels(text,lineNumber,labels,pc,rows=null){
  let rest=text;
  while(rest){
    const match=rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*/);
    if(!match)break;
    const name=match[1].toUpperCase();
    if(labels&&Object.prototype.hasOwnProperty.call(labels,name))throw Error(`Ligne ${lineNumber}: label ${name} dupliqué`);
    if(labels)labels[name]=pc;
    if(rows)rows.push({type:"label",name});
    rest=rest.slice(match[0].length).trim();
  }
  return rest;
}

export function assemble(source){
  const labels={};
  const parsed=[];
  let pc=0;
  source.split(/\r?\n/).forEach((raw,index)=>{
    const lineNumber=index+1;
    let text=cleanLine(raw);
    if(!text)return;
    text=consumeLabels(text,lineNumber,labels,pc);
    if(!text)return;
    let size;
    if(/^HALT$/i.test(text))size=2;
    else{
      const {body}=splitCondition(text,lineNumber);
      const arrows=body.split("->");
      if(arrows.length!==2)throw Error(`Ligne ${lineNumber}: instruction attendue sous la forme SOURCE -> DESTINATION`);
      size=/^(CONST|ALU)\s+/i.test(arrows[0].trim())?2:1;
    }
    parsed.push({lineNumber,address:pc,text});
    pc+=size;
    if(pc>256)throw Error("Programme supérieur à 256 octets");
  });

  const image=new Uint8Array(256);
  const list=[];
  for(const item of parsed){
    const {lineNumber,address}=item;
    if(/^HALT$/i.test(item.text)){
      const opcode=(SOURCES.CONST<<5)|(DESTINATIONS.PC<<2)|CONDITIONS.ALWAYS;
      image[address]=opcode;
      image[address+1]=address;
      list.push({a:address,bytes:[opcode,address],text:"HALT",src:"CONST",dst:"PC",cond:"ALWAYS",extra:address,halt:true,lineNumber});
      continue;
    }
    const {body,condition}=splitCondition(item.text,lineNumber);
    const parts=body.split("->");
    const left=parts[0].trim();
    const destination=parts[1].trim().toUpperCase();
    if(!Object.prototype.hasOwnProperty.call(DESTINATIONS,destination))throw Error(`Ligne ${lineNumber}: destination inconnue ${destination}`);
    let sourceName;
    let extra=null;
    if(/^CONST\s+/i.test(left)){
      sourceName="CONST";
      extra=parseNumber(left.replace(/^CONST\s+/i,""),labels,lineNumber);
    }else if(/^ALU\s+/i.test(left)){
      sourceName="ALU";
      const operation=left.replace(/^ALU\s+/i,"").trim().toUpperCase();
      if(!Object.prototype.hasOwnProperty.call(ALU_OPS,operation))throw Error(`Ligne ${lineNumber}: opération ALU inconnue ${operation}`);
      extra=ALU_OPS[operation];
    }else{
      sourceName=left.toUpperCase();
      if(!Object.prototype.hasOwnProperty.call(SOURCES,sourceName))throw Error(`Ligne ${lineNumber}: source inconnue ${sourceName}`);
    }
    if((sourceName==="RAM"||sourceName==="POP")&&(destination==="RAM"||destination==="PUSH")){
      throw Error(`Ligne ${lineNumber}: conflit RAM mono-port entre ${sourceName} et ${destination}`);
    }
    const opcode=(SOURCES[sourceName]<<5)|(DESTINATIONS[destination]<<2)|CONDITIONS[condition];
    const bytes=[opcode];
    image[address]=opcode;
    if(extra!==null){image[address+1]=extra;bytes.push(extra);}
    list.push({a:address,bytes,text:item.text,src:sourceName,dst:destination,cond:condition,extra,halt:false,lineNumber});
  }
  return {image,list,used:pc,labels,byAddress:new Map(list.map(item=>[item.a,item]))};
}

export function textToRows(source){
  const rows=[];
  const labels={};
  source.split(/\r?\n/).forEach((raw,index)=>{
    const lineNumber=index+1;
    let text=cleanLine(raw);
    if(!text)return;
    text=consumeLabels(text,lineNumber,labels,0,rows);
    if(!text)return;
    if(/^HALT$/i.test(text)){rows.push({type:"halt"});return;}
    const {body,condition}=splitCondition(text,lineNumber);
    const parts=body.split("->");
    if(parts.length!==2)throw Error(`Ligne ${lineNumber}: instruction invalide`);
    const left=parts[0].trim();
    const dst=parts[1].trim().toUpperCase();
    let src=left.toUpperCase();
    let extra="";
    const match=left.match(/^(CONST|ALU)\s+(.+)$/i);
    if(match){src=match[1].toUpperCase();extra=match[2].trim().toUpperCase();}
    if(!Object.prototype.hasOwnProperty.call(SOURCES,src))throw Error(`Ligne ${lineNumber}: source inconnue ${src}`);
    if(!Object.prototype.hasOwnProperty.call(DESTINATIONS,dst))throw Error(`Ligne ${lineNumber}: destination inconnue ${dst}`);
    rows.push({type:"instruction",src,dst,cond:condition,extra});
  });
  assemble(source);
  return rows;
}

export function rowToText(row){
  if(row.type==="label")return `${row.name}:`;
  if(row.type==="halt")return "HALT";
  const extra=(row.src==="CONST"||row.src==="ALU")?` ${row.extra}`:"";
  return `${row.src}${extra} -> ${row.dst}${row.cond!=="ALWAYS"?` IF ${row.cond}`:""}`;
}

const sourceNode=index=>index<=3?`r${index}`:["ram","alu","ram","ir"][index-4];
const destinationNode=index=>index<=3?`r${index}`:["mar","ram","pc","ram"][index-4];

export class CPU{
  constructor(program){this.program=program;this.p=new Uint8Array(program.image);this.reset();}
  reset(){
    this.r=[0,0,0,0];this.ram=new Uint8Array(256);this.mar=0;this.pc=0;this.sp=255;
    this.z=0;this.c=0;this.cycles=0;this.microCycles=0;this.halted=false;this.haltReason="";
    this.plan=null;this.planIndex=0;this.lastEvent=null;this.lastMemoryWrite=null;this.aluA=null;this.aluB=null;this.aluResult=null;
  }
  condition(code){return code===0||(code===1&&this.z===1)||(code===2&&this.z===0)||(code===3&&this.c===1);}
  calculate(operation){
    const a=this.r[0],b=this.r[1];let result=0,carry=0;
    if(operation===0){const full=a+b;result=full&255;carry=full>255?1:0;}
    else if(operation===1){result=(a-b)&255;carry=a>=b?1:0;}
    else if(operation===2)result=a&b;
    else if(operation===3)result=a|b;
    else if(operation===4)result=a^b;
    else if(operation===5){carry=a>>7;result=(a<<1)&255;}
    else if(operation===6){carry=a&1;result=a>>1;}
    else if(operation===7)result=(~a)&255;
    else throw Error(`Code ALU inconnu ${operation}`);
    return {result,zero:result===0?1:0,carry};
  }
  event(kind,description,options={}){return {kind,description,bus:false,value:null,from:null,to:null,...options};}
  preparePlan(){
    const entry=this.program.byAddress.get(this.pc);
    if(!entry){
      const reason=this.pc===this.program.used?"Fin du programme":`Aucune instruction à l'adresse 0x${hex(this.pc)}`;
      this.plan=[this.event("halt",reason,{apply:()=>{this.halted=true;this.haltReason=reason;}})];this.planIndex=0;return;
    }
    const p0=this.pc,opcode=this.p[p0],s=(opcode>>5)&7,d=(opcode>>2)&7,q=opcode&3;
    const hasExtra=s===SOURCES.ALU||s===SOURCES.CONST;
    const extra=hasExtra?this.p[(p0+1)&255]:null;
    const next=(p0+(hasExtra?2:1))&255;
    const common={instruction:entry,p0,opcode,s,d,q,extra};
    const plan=[
      this.event("fetch",`PC place l'adresse 0x${hex(p0)} sur le bus`,{...common,bus:true,value:p0,from:"pc",to:"rom"}),
      this.event("fetch",`La mémoire programme envoie l'opcode 0x${hex(opcode)} au registre d'instruction`,{...common,bus:true,value:opcode,from:"rom",to:"ir"})
    ];
    if(hasExtra)plan.push(this.event("fetch",`Lecture de l'octet d'extension 0x${hex(extra)}`,{...common,bus:true,value:extra,from:"rom",to:"ir"}));
    const execute=this.condition(q);
    plan.push(this.event("decode",`${SOURCE_NAMES[s]} vers ${DESTINATION_NAMES[d]} -- condition ${CONDITION_NAMES[q]} ${execute?"satisfaite":"non satisfaite"}`,{...common,execute}));
    if(entry.halt){
      plan.push(this.event("halt","HALT arrête le processeur",{...common,apply:()=>{this.pc=p0;this.halted=true;this.haltReason="Instruction HALT";}}));
      this.plan=plan;this.planIndex=0;return;
    }
    if(!execute){
      plan.push(this.event("skip","Instruction ignorée: le PC avance sans transfert",{...common,apply:()=>{this.pc=next;}}));
      this.plan=plan;this.planIndex=0;return;
    }
    let value;
    let from=sourceNode(s);
    if(s<=3)value=this.r[s];
    else if(s===SOURCES.RAM)value=this.ram[this.mar];
    else if(s===SOURCES.POP){
      const newSp=(this.sp+1)&255;value=this.ram[newSp];
      plan.push(this.event("stack",`SP remonte de ${this.sp} à ${newSp}`,{...common,from:"sp",to:"sp",apply:()=>{this.sp=newSp;}}));
    }else if(s===SOURCES.CONST)value=extra;
    else if(s===SOURCES.ALU){
      const operation=ALU_NAMES[extra];
      const unary=["SHL","SHR","NOT"].includes(operation);
      plan.push(this.event("operand",`R0 place ${this.r[0]} sur le bus vers l'entrée A de l'ALU`,{...common,bus:true,value:this.r[0],from:"r0",to:"alu",apply:()=>{this.aluA=this.r[0];}}));
      if(!unary)plan.push(this.event("operand",`R1 place ${this.r[1]} sur le bus vers l'entrée B de l'ALU`,{...common,bus:true,value:this.r[1],from:"r1",to:"alu",apply:()=>{this.aluB=this.r[1];}}));
      const alu=this.calculate(extra);value=alu.result;
      plan.push(this.event("compute",`ALU ${operation}: résultat ${value}, Z=${alu.zero}, C=${alu.carry}`,{...common,from:"alu",to:"flags",alu,operation,apply:()=>{this.aluResult=value;this.z=alu.zero;this.c=alu.carry;}}));
      from="alu";
    }
    const to=destinationNode(d);
    let description=`${SOURCE_NAMES[s]} place ${value} sur le bus, ${DESTINATION_NAMES[d]} le reçoit`;
    if(d===DESTINATIONS.RAM)description=`Écriture de ${value} dans RAM[${this.mar}]`;
    if(d===DESTINATIONS.PUSH)description=`PUSH écrit ${value} dans RAM[${this.sp}], puis SP descend`;
    plan.push(this.event("write",description,{...common,bus:true,value,from,to,apply:()=>{
      if(d<=3)this.r[d]=value;
      else if(d===DESTINATIONS.MAR)this.mar=value;
      else if(d===DESTINATIONS.RAM){this.ram[this.mar]=value;this.lastMemoryWrite=this.mar;}
      else if(d===DESTINATIONS.PC)this.pc=value;
      else if(d===DESTINATIONS.PUSH){this.ram[this.sp]=value;this.lastMemoryWrite=this.sp;this.sp=(this.sp-1)&255;}
      if(d!==DESTINATIONS.PC)this.pc=next;
    }}));
    this.plan=plan;this.planIndex=0;
  }
  microStep(){
    if(this.halted)return this.lastEvent;
    if(!this.plan)this.preparePlan();
    const event=this.plan[this.planIndex];
    if(event.apply)event.apply();
    this.planIndex+=1;this.microCycles+=1;
    const complete=this.planIndex>=this.plan.length;
    if(complete){this.plan=null;this.planIndex=0;this.cycles+=1;}
    this.lastEvent={...event,complete};
    return this.lastEvent;
  }
  stepInstruction(){
    if(this.halted)return [];
    const start=this.cycles;const events=[];
    while(!this.halted&&this.cycles===start&&events.length<32)events.push(this.microStep());
    return events;
  }
}

export function runProgram(source,maxInstructions=10000){
  const program=assemble(source);const cpu=new CPU(program);
  while(!cpu.halted&&cpu.cycles<maxInstructions)cpu.stepInstruction();
  if(!cpu.halted)throw Error(`Programme non terminé après ${maxInstructions} instructions`);
  return {program,cpu};
}
