#!/usr/bin/env node

const { Telnet } = require("telnet-client");
const fs = require("fs");
const { parseArgs} = require("util");
const { question } = require("readline-sync");
const cluster = require("cluster");
const { availableParallelism } = require("os");
const IPCIDR = require("ip-cidr");
const puppeteer = require("puppeteer");

const args = parseArgs({
	"options": {
        "telnet": {
            "type": "boolean",
            "short": "t"
        },
        "web": {
            "type": "boolean",
            "short": "w"
        },
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
            "short": "T"
        },
        "timeoutweb": {
            "type": "string",
            "short": "Q"
        },
        "workers": {
            "type": "string",
            "short": "W"
        },
		"help": {
			"type": "boolean",
            "short": "h"
		}
	}
});

const TELNET = args.values.telnet;
const WEB = args.values.web;
const OUTFILE = args.values.outfile;
const INFILE = args.values.infile;
const TIMEOUT = parseInt(args.values.timeout ?? 500);
const TIMEOUTWEB = parseInt(args.values.timeoutweb ?? 1500);
const WORKERS = parseInt(args.values.workers ?? availableParallelism());
const HELP = args.values.help;

const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

if(HELP) {
    console.log(`
Improved adminadmin finder - Milk_Cool, 2023

Usage:
adminadmin --help
adminadmin [-t] [-w] [-i INFILE] [-o OUTFILE] [-t TIMEOUT] [-w WORKERS]

Arguments:
-t, --telnet      Try to authenticate with Telnet (port 23)
-w, --web         Try to authenticate with Chrome (port 80)
-h, --help        Prints help and exits.
-i, --infile      Defines the file to take IP addresses from. Also accepts wildcard IPs such as 1.2.*.*.
-o, --outfile     Defines the file to write vulnerable routers to. Overwrites the contents of the file.
-T, --timeout     Defines the Telnet connection timeout (default: 500)
-Q, --timeoutweb  Defines the Chrome connection timeout (default: 1500)
-W, --workers     Defines the amount of workers to fork (default: no. of CPU cores)
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
    if(IPCIDR.isValidCIDR(pattern)) {
        const cidr = new IPCIDR(pattern);
        return cidr.toArray();
    }
    if(pattern.includes("*")) {
        for(let i = 0; i < 256; i++)
            list = processIPs(pattern.replace("*", i), depth + 1, list);
        return list;
    }
    return list.concat([pattern]);
}

const testOne = async (host, browser) => {
    if(TELNET) {
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
        } catch(_) { }
    }
    if(WEB) {
        try {
            const page = await browser.newPage();
            await page.goto(`http://${host}:80`, { "timeout": TIMEOUTWEB });
            await page.type("input[autocomplete=\"username\"],input[name=\"user\"],input[name=\"name\"],input[name=\"username\"],input#userName,input[name=\"login\"],input[name=\"loginLogin\"],input[type=\"text\"]", "admin");
            await page.type("input[autocomplete=\"password\"],input[type=\"password\"],input[name=\"pass\"],input#pcPassword,input[name=\"passphrase\"],input[name=\"password\"]", "admin");
            await page.click("input[type=\"submit\"],button[type=\"submit\"],button");
            const res = await page.waitForNavigation({ "timeout": TIMEOUTWEB });
            if(res.status().toString()[0] == "2") {
                cluster.worker.send("+" + host);
                return true;
            }
        } catch(_) { }
    }
    cluster.worker.send("-" + host);
    return false;
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
        worker.on("online", async () => {
            console.log(`Worker #${worker.id} online!`);
            await sleep(1000);
            worker.send(listFinal.pop());
        });
        worker.on("message", msg => {
            process.stdout.write("\x1b[43m" + Math.round((1 - n / m) * 100).toString().padStart(3) + "%\x1b[0m");
            if(msg[0] == "+") {
                printSuccess(msg.slice(1));
                if(OUTFILE) fs.appendFileSync(OUTFILE, msg.slice(1) + "\n");
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
    let browser = null;
    if(WEB) {
        browser = await puppeteer.launch({ "headless": "new" });
    }
    process.on("message", msg => testOne(msg, browser));
};

if(cluster.isPrimary)
    main();
else
    mainWorker();