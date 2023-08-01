#!/usr/bin/env node

const { Telnet } = require("telnet-client");
const fs = require("fs");
const { parseArgs} = require("util");
const { question } = require("readline-sync");
const cluster = require("cluster");
const { availableParallelism } = require("os");

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
        "workers": {
            "type": "string",
            "short": "w"
        },
		"help": {
			"type": "boolean",
            "short": "h"
		}
	}
});

const OUTFILE = args.values.outfile;
const INFILE = args.values.infile;
const TIMEOUT = parseInt(args.values.timeout ?? 500);
const WORKERS = parseInt(args.values.workers ?? availableParallelism());
const HELP = args.values.help;

if(HELP) {
    console.log(`
Improved adminadmin finder - Milk_Cool, 2023

Usage:
adminadmin --help
adminadmin [-i INFILE] [-o OUTFILE] [-t TIMEOUT] [-w WORKERS]

Arguments:
-h, --help    Prints help and exits.
-i, --infile  Defines the file to take IP addresses from. Also accepts wildcard IPs such as 1.2.*.*.
-o, --outfile Defines the file to write vulnerable routers to. Overwrites the contents of the file.
-t, --timeout Defines the connection timeout (default: 500)
-w, --workers Defines the amount of workers to fork (default: no. of CPU cores)
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
        "timeout": TIMEOUT,
        "login": "admin",
        "password": "admin"
    };

    try {
        await connection.connect(params);
        await connection.end();
        await connection.destroy();
        cluster.worker.send("+" + host);
        return true;
    } catch(_) {
        cluster.worker.send("-" + host);
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
    if(OUTFILE) fs.writeFileSync(OUTFILE, "");
    let listFinal = [];
    for(let i of list)
        listFinal = listFinal.concat(processIPs(i));
    let n = listFinal.length;
    const m = n;
    for(let i = 0; i < Math.min(WORKERS, listFinal.length); i++) {
        const worker = cluster.fork();
        worker.on("online", () => {
            console.log(`Worker #${worker.id} online!`);
            worker.send(listFinal.pop());
        });
        worker.on("message", msg => {
            process.stdout.write("\x1b[43m" + Math.round((1 - n / m) * 100).toString().padStart(3) + "%\x1b[0m");
            if(msg[0] == "+") {
                printSuccess(msg.slice(1));
                fs.appendFileSync(OUTFILE, msg.slice(1) + "\n");
            } else
                printFail(msg.slice(1));
            n--;
            if(listFinal.length != 0) worker.send(listFinal.pop());
        });
    }
    setInterval(() => {
        if(n == 0) {
            for(let worker of Object.values(cluster.workers))
                worker.kill();
            process.exit(0);
        }
    }, 500);
}

const mainWorker = async () => {
    process.on("message", testOne);
};

if(cluster.isPrimary)
    main();
else
    mainWorker();