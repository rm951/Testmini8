import assert from "node:assert/strict";
import {assemble,CPU,runProgram,textToRows,rowToText} from "../core.mjs";

const addition=`
CONST 7 -> R0
CONST 8 -> R1
ALU ADD -> R3
HALT
`;
{
  const program=assemble(addition);
  const cpu=new CPU(program);
  cpu.stepInstruction();
  cpu.stepInstruction();
  const aluEvents=cpu.stepInstruction();
  assert.ok(aluEvents.some(event=>event.from==="r0"&&event.to==="alu"&&event.value===7));
  assert.ok(aluEvents.some(event=>event.from==="r1"&&event.to==="alu"&&event.value===8));
  assert.ok(aluEvents.some(event=>event.from==="alu"&&event.to==="r3"&&event.value===15));
  cpu.stepInstruction();
  assert.equal(cpu.r[3],15);
  assert.equal(cpu.haltReason,"Instruction HALT");
}

{
  const {cpu}=runProgram(`
CONST 42 -> R0
CONST 200 -> MAR
R0 -> RAM
RAM -> R2
HALT`);
  assert.equal(cpu.ram[200],42);
  assert.equal(cpu.r[2],42);
}

const factorial=`
CONST 5 -> R0
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
HALT
`;
{
  const {cpu}=runProgram(factorial);
  assert.equal(cpu.r[0],120);
  assert.equal(cpu.ram[200],120);
}

{
  assert.throws(()=>assemble("CONST 0xZZ -> R0"),/valeur ou label inconnu/);
  assert.throws(()=>assemble("CONST 0b102 -> R0"),/valeur ou label inconnu/);
  assert.throws(()=>assemble("RAM -> PUSH"),/conflit RAM mono-port/);
  assert.throws(()=>assemble("CONST 256 -> R0"),/hors plage/);
}

{
  const source="DEBUT:\nCONST 2 -> R0\nHALT";
  const rows=textToRows(source);
  assert.equal(rows.map(rowToText).join("\n"),source);
}

{
  const program=assemble("CONST 1 -> R0 IF Z\nHALT");
  const cpu=new CPU(program);
  cpu.stepInstruction();
  assert.equal(cpu.r[0],0);
  assert.equal(cpu.pc,2);
}

console.log("Mini8 core tests: OK");
