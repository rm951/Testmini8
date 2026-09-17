# Mini8 Lab

Mini8 Lab est un processeur 8 bits pédagogique entièrement exécuté dans le navigateur. Son interface montre chaque micro-opération autour d'un bus central: lecture d'un registre, passage sur le bus, calcul de l'ALU, accès à la RAM, pile et écriture de la destination.

Démo: https://rm951.github.io/Testmini8/

## Architecture

- programme et RAM de 256 octets;
- registres généraux R0 à R3;
- registres PC, MAR et SP;
- bus de données 8 bits;
- drapeaux Z et C;
- ALU utilisant R0 comme entrée A et R1 comme entrée B;
- pile descendante initialisée avec SP=255.

L'instruction principale tient sur un octet: `SSS DDD CC`.

- `SSS`: source;
- `DDD`: destination;
- `CC`: condition.

`CONST` et `ALU` utilisent un deuxième octet. `HALT` est une pseudo-instruction assemblée comme un saut sur elle-même et reconnue explicitement par le simulateur.

## Syntaxe

```text
CONST 7 -> R0
CONST 8 -> R1
ALU ADD -> R3
CONST BOUCLE -> PC IF NZ
R0 -> PUSH
POP -> R2
HALT
```

Les valeurs peuvent être décimales (`42`), hexadécimales (`0x2A`) ou binaires (`0b101010`). Les commentaires commencent par `;` ou `#`.

Sources: `R0`, `R1`, `R2`, `R3`, `RAM`, `ALU`, `POP`, `CONST`.

Destinations: `R0`, `R1`, `R2`, `R3`, `MAR`, `RAM`, `PC`, `PUSH`.

Conditions: `ALWAYS`, `Z`, `NZ`, `C`.

Opérations ALU: `ADD`, `SUB`, `AND`, `OR`, `XOR`, `SHL`, `SHR`, `NOT`.

## Interface

- constructeur par cartes et éditeur texte synchronisés;
- édition, duplication et réorganisation des instructions;
- exemples d'addition, RAM, pile, boucle et factorielle;
- micro-pas ou pas par instruction;
- bus central animé à partir des événements réels du processeur;
- vues des registres, de la RAM, de la pile, du code machine et de la trace;
- points d'arrêt en cliquant sur une adresse du programme machine;
- sauvegarde locale automatique du programme.

## Tests

```bash
npm test
```

Les tests couvrent l'addition, la RAM, les conditions, les erreurs de syntaxe et la factorielle de 5, qui doit produire 120 dans R0 et RAM[200].
