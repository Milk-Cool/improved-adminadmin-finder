#!/usr/bin/env node

const { Telnet } = require("telnet-client");
const fs = require("fs");
const { parseArgs} = require("util");
const { question } = require("readline-sync");

const args = parseArgs({
	"options": {
		"outfile": {
			"type": "string",
			"short": "o"
		},
		"infile": {
            "type": "string",
            "short": "i"
        },
        "timeout": {
            "type": "string",
            "short": "t"
        },
		"help": {
			"type": "boolean"
		}
	}
});

const OUTFILE = args.values.outfile;
const INFILE = args.values.infile;
const TIMEOUT = args.values.timeout ?? 500;
const HELP = args.values.help;

if(HELP) {
    console.log(`
Improved adminadmin finder - Milk_Cool, 2023

Usage:
adminadmin --help
adminadmin [-i INFILE] [-o OUTFILE] [-t TIMEOUT]

Arguments:
--help        Prints help and exits.
-i, --infile  Defines the file to take IP addresses from. Also accepts wildcard IPs such as 1.2.*.*.
-o, --outfile Defines the file to write vulnerable routers to. Overwrites the contents of the file.
-t, --timeout Defines the connection timeout (default: 500)
`);
	process.exit(0);
}

const printFail = async host => {
    console.log("\x1b[41m\x1b[37mFAILURE\x1b[0m \x1b[1m" + host + "\x1b[0m");
};
const printSuccess = async host => {
    console.log("\x1b[42m\x1b[37mSUCCESS\x1b[0m \x1b[1m" + host + "\x1b[0m");
};

const processIPs = (pattern, depth = 0, list = []) => {
    if(pattern.includes("*")) {
        for(let i = 0; i < 256; i++)
            list = processIPs(pattern.replace("*", i), depth + 1, list);
        return list;
    }
    return list.concat([pattern]);
}

const testOne = async host => {
    const connection = new Telnet();
    const params = {
        host,
        "port": 23,
        "timeout": parseInt(TIMEOUT),
        "login": "admin",
        "password": "admin"
    };

    try {
        await connection.connect(params);
        await connection.end();
        await connection.destroy();
        printSuccess(host);
        return true;
    } catch(_) {
        printFail(host);
        return false;
    }
};

const main = async () => {
    let list = [];
    if(INFILE) {
        list = fs.readFileSync(INFILE, "utf-8").split("\n").filter(x => x);
    } else {
        list = question("Enter the IP ranges, separated with a comma: ").split(",").map(x => x.trim());
    }
    let listFinal = [];
    for(let i of list)
        listFinal = listFinal.concat(processIPs(i));
    let out = [];
    for(let i of listFinal) {
        const res = await testOne(i);
        if(res) out.push(i);
    }
    if(OUTFILE)
        fs.writeFileSync(OUTFILE, out.join("\n"));
}

main();