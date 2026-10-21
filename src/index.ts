#!/usr/bin/env bun
import { main } from "./cli";
import { consoleIo } from "./io";

process.exit(await main(process.argv.slice(2), consoleIo));
