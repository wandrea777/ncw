// De officiële Ledger-bibliotheken gebruiken Node's globale `Buffer`. Alleen geladen vlak vóór de Ledger-code
// (dynamische import), zodat de rest van de app er niets van merkt.
import { Buffer } from "buffer";

const g = globalThis as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
