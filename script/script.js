/////////////////////// Process the main operations ////////////////
const processData = {

    receiveNewClient: function(data)  {
        let name, address, start, end, details, newClient;
        
        if (data) {
            name = data.get("newClientName");
            address = data.get("newClientAddress");
            start = data.get("newClientTimeStart");
            end = data.get("newClientTimeEnd");
            details = data.get("newClientDetails");

            let nameArr = name.split("");
            name = nameArr.filter(curr => curr !== ".").join("");
    
            class Client {
                constructor(name, address, start, end, details) {
                    this.name = name;
                    this.address = address;
                    this.start = start;
                    this.end = end;
                    this.details = details;
                }
            }
    
            newClient = new Client(name, address, start, end, details);
        }
        const docName = `${name}_${start}_${end}`;

        // Check if start and end is set
        if (start && end && name) {
            return [newClient, docName];
        } else {
            return [false, false];
        }
    },

    // Create new schedule
    newSchedule: function (ids, scheduleMap, msg) {
        let dbDocName, keyClientName, valDay, valStart, valEnd, valNote, newSchedule;

        dbDocName = ids[4];
        keyClientName = ids[0];
        valDay = ids[3];
        valStart = ids[1];
        valEnd = ids[2];


        class Schedule {
            constructor(dbDocName, keyClientName, valDay, valStart, valEnd, daySchedule, valNote) {
                this.dbDocName = dbDocName;
                this.keyClientName = keyClientName;
                this.valDay = valDay;
                this.valStart = valStart;
                this.valEnd = valEnd;
            }

            busyCheck() {
                let check, msg;

                const schedules = Object.entries(scheduleMap.get(dbDocName));
                const daySchedule = schedules.filter(schedule => schedule[0].charAt(schedule[0].length - 1) === valDay);

                if(daySchedule.length > 0) {
                    for(const curr of daySchedule) {
            
                        const start = curr[1].start;
                        const end = curr[1].end;
                        const dbStart = Number(valStart);
                        const dbEnd = Number(valEnd);
                        
                            
                        if (dbStart > start && dbStart < end) {
                            msg = `Chybný začátek asistence.`;
                            check = true;
                            break;
                        } else if (dbEnd > start && dbEnd < end) {
                            msg = `Chybný konec asistence.`;
                            check = true;
                            break;
                        } else if (dbStart < start && dbEnd > end || dbStart > start && dbEnd < end) {
                            msg = `Asistence se prolína s nějákou jinači.`;
                            check = true;
                            break;
                        } else {
                            msg = `Už toho má dneska více, tak jí ještě přidáme :)`;
                            check = false;
                        }
                    }
                } else {
                    msg = `Zatím první asistence, tak jí ještě nalož :)`;
                    check = false;
                }
                return [check, msg];
            }
        }

        newSchedule = new Schedule(dbDocName, keyClientName, valDay, valStart, valEnd);

        let isBusy, message;

        if (scheduleMap.get(dbDocName)) {
            [isBusy, message] = newSchedule.busyCheck();

            
        } else {
            [isBusy, message] = [false, "Zatím první asistence, tak jí ještě nalož :)"];

        }

        if (isBusy) {
            msg("warning", message);

        } else {
            msg("success", message);
            return newSchedule;
        }
    },
};

//////////////////// Saving data into db //////////////////
const saveData = {

    newClient: function (newClientData, docName) {
        // Firestore data converter
        const clientConverter = {
            toFirestore: function(client) {
                return {
                    name: client.name,
                    address: client.address,
                    start: client.start,
                    end: client.end,
                    details: client.details
                    }
            },
            fromFirestore: function(snapshot, options){
                const data = snapshot.data(options);
                return new Client(data.name, data.address, data.start, data.end, data.details)
            }
        }

        // Save new client with converter
        db.collection("clientList").doc(docName)
            .withConverter(clientConverter)
            .set(newClientData);

    },

    saveSchedule: function (newSchedule) {

        if (newSchedule){
            // Firestore data converter
            var shceduleConverter = {
                toFirestore: function(schedule) {
                    return {[`${schedule.keyClientName} ${schedule.valDay}`]: {
                        start: schedule.valStart,
                        end: schedule.valEnd,
                        day: schedule.valDay,
                    }};
                },
            }

            // Set with converter
            db.collection("schedule").doc(newSchedule.dbDocName)
            .withConverter(shceduleConverter)
            .set(newSchedule, {merge: true});

            return newSchedule.dbDocName;
        }
    },
};

/////////////////// Loading data from db //////////////////
const loadData = function() {

    // Load client list from DB, run update client list UI
    const getClients = new Promise((resolve, reject) => {
        let clientsData = new Map();

        db.collection("clientList").orderBy("start").onSnapshot(snapshot => {
            let changes = snapshot.docChanges();
            changes.forEach(change => {
                if (change.type === "added") {
                    clientsData.set(change.doc.id, change.doc.data());
                }
            }); 
            resolve(clientsData);
        });
    });

    const getSchedule = new Promise((resolve, reject) => {
        let scheduleData = new Map();

        db.collection("schedule").onSnapshot(snapshot => {
            let changes = snapshot.docChanges();
            changes.forEach(change => {
                if (change.type === "added") {
                    scheduleData.set(change.doc.id, change.doc.data());
                }
            }); 
            resolve(scheduleData);
        });
    });

    return {
        getClients,
        getSchedule,
    }
};

const remove = {

    client: (id, scheduleMap) => {
        id = [id.slice(0, -7), ":", id.slice(-7, -2), ":", id.slice(-2)].join("");

        // Remove existing schedules with client to be removed
        remove.schedule(null, id, scheduleMap);

        //Remove Client itself
        db.collection("clientList").doc(id).delete();
    },

    schedule: function (ids, clientToRemove, scheduleMap) {
        if (ids) {
            const dataToDel = db.collection("schedule").doc(ids[4]);
            const fieldString = `${ids[0]} ${ids[3]}`;
     
             dataToDel.update({
                 [fieldString]: firebase.firestore.FieldValue.delete()
             });

        } else if(clientToRemove) {
            for(const [key, value] of scheduleMap) {
                const valArr = Object.entries(value);

                valArr.forEach(curr => {
                    if(curr[0].includes(clientToRemove.slice(0, -12))) {
                        const dataToDel = db.collection("schedule").doc(key);
                        dataToDel.update({
                            [curr[0]]: firebase.firestore.FieldValue.delete()
                        });
                    }
                })
            }
        }

    },
}

////////////////// App UI /////////////////////////
const UIManipulation = function() {

    // Selectors for new client
    const selectors = new Map();
        selectors.set("newClientName", document.getElementById("name"));
        selectors.set("newClientAddress", document.getElementById("place"));
        selectors.set("newClientTimeStart", document.getElementById("time1s"));
        selectors.set("newClientTimeEnd", document.getElementById("time1e"));
        selectors.set("newClientDetails", document.getElementById("details"));

    const buttons = {
        newClientConfirm: document.getElementById("save-client"),
    }

    // Get values from inputs to new client
    const inputData = function() {
        let readInputs = new Map();

        selectors.forEach((value, key) => {
            readInputs.set(key, value.value);
            // Clear fields
            selectors.set(key, value.value = "");
        })

        return readInputs;
    };

    // Generate Client fields UI
    const generateTableLayout = function(clientData) {

        // Helper function
        function multiEl(howMany, whatEl, whereToAppend, classBreak, className1, className2, idStart) {
            for (let i = 0; i < howMany; i++) {
                const el = whatEl.cloneNode();
                let append = whereToAppend.appendChild(el);

                if (i <= classBreak) {
                    className1 ? append.classList.add(className1) : null;
                } else {
                    className2 ? append.classList.add(className2) : null;
                }

                whatEl.id = idStart ? idStart++ : "";
            }
        }
        const selectTable = document.querySelector('tbody');

        const createTr = document.createElement('tr');
        const createTd = document.createElement('td');
        const createP = document.createElement('p');
        const createDelBtn = document.createElement('div');

        // Create tr
        multiEl(clientData.size, createTr, selectTable, clientData.size - 1, "field-row");

        const selectTr = document.querySelectorAll('tbody tr');

        // Create td
        Array.from(selectTr).forEach((curr, index) => {
            multiEl(8, createTd, curr, 0, "client-list", "workers-field", 1);
        });

        const selectFirstTd = document.querySelectorAll('tbody td:first-child');
        const selectOtherTds = document.querySelectorAll("tbody td:not(:first-child)");

        // Create para and delete btn
        Array.from(selectFirstTd).forEach((curr, index) => {
            multiEl(1, createDelBtn, curr, 0, "remove-client-box");
            multiEl(1, createP, curr, 0, "para-name");
            multiEl(1, createP, curr, 0, "para-address");
            multiEl(1, createP, curr, 0, "para-time");
            multiEl(1, createP, curr, 0, "para-detail");
        })
        // Add class to other tds
        Array.from(selectOtherTds).forEach(curr => {
            curr.classList.add("workers-field");
            curr.classList.add("hover-td");
        });

        // remove client btn append to div
        const btnsArr = document.querySelectorAll(".remove-client-box");
        Array.from(btnsArr).forEach(curr => {
            curr.innerHTML = `
                <button type="button" class="close remove-client" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>`;
        })
        

        // Add data to fields
        let count = -1;
        for (const [key, value] of clientData) {
            count++;

            const clientList = Array.from(document.querySelectorAll(".client-list"));
            const pName = Array.from(document.querySelectorAll(".para-name"));
            const pAddress = Array.from(document.querySelectorAll(".para-address"));
            const pTime = Array.from(document.querySelectorAll(".para-time"));
            const pDetail = Array.from(document.querySelectorAll(".para-detail"));

            // Create and attach ID to client list
            let createId = `${value.name}_${value.start}_${value.end}`;
            let id = "";
            for (let i = 0; i < createId.length; i++) {createId[i] !== ":" ? id += createId[i] : null;}
            clientList[count].id = id;

            pName[count].textContent = value.name;
            pAddress[count].textContent = value.address;
            pTime[count].textContent = `${value.start} - ${value.end}`;
            pDetail[count].textContent = value.details;
        }
    };

    const newSchedule = (scheduleMap, newScheduleConfirmed) => {

        let isFirstPopover = true;

        // External click event fn for new schedule
        const openPopoverEvent = (e, curr, index) => {

            // Create popover
            const popover = new bootstrap.Popover(e.srcElement, {
                container: "body",
                html: true,
                placement: "auto",
                trigger: "manual",
            });

            //generate ID
            const id = `${e.srcElement.parentElement.cells[0].id}_${ curr.id}`;
            const idArr = id.split('_');

            // DOM element for popover clone
            let doc = document.querySelector(".popover-box").cloneNode(true);
            doc.classList.remove("d-none");

            // Bootstrap popover to show
            // Check if workers-field is set, then add or remove
            if (e.target.innerText === "") {
                popover.config.content = doc;
                popover.config.title = `Přiradit asistenci pro ${idArr[0]}`;

                showPopover();


                // Confirm new schedule btn
                const confirmScheduleBtn = document.querySelector(".popover-body .popover-box #confirm-schedule");
                //Add schedule
                confirmScheduleBtn.addEventListener("click", () => {
                    const assistantId = document.querySelector(".popover-body .popover-box .select-assistant").value;

                    if (assistantId !== "0") {
                        idArr.push(assistantId);
                        newScheduleConfirmed(idArr, true);
                        hidePopover();
                } else {
                    message("warning", "Asistentka nebyla vybrána");
                }
            })
            } else {
                // Adjust UI to removing
                popover.config.title = `Odebrat asistenci pro ${idArr[0]}`

                const assistantId = doc.querySelector(".select-assistant");
                assistantId.value = e.target.innerText;
                assistantId.setAttribute("disabled", "true");

                const replaceBtn = doc.querySelector("#confirm-schedule");
                replaceBtn.setAttribute("id", "remove-schedule");
                replaceBtn.classList.remove("btn-primary");
                replaceBtn.classList.add("btn-danger");
                replaceBtn.textContent = "Odstranit";

                popover.config.content = doc;
                showPopover();

                // Remove listener
                replaceBtn.addEventListener("click", () => {
                    idArr.push(assistantId.value);
                    newScheduleConfirmed(idArr);
                    hidePopover();
                })
            }

            // Close popover 
            const btnClose = Array.from(document.querySelectorAll(".schedule-close"));

            function showPopover() {
                popover.show();
                isFirstPopover = false;
                e.target.classList.add("td-pop-opened");

                const tds = document.querySelectorAll("tbody td:not(:first-child)");
                Array.from(tds).forEach(curr => {
                    curr.classList.remove("hover-td");
                })
            }
            function hidePopover() {
                popover.hide();
                isFirstPopover = true;
                e.target.classList.remove("td-pop-opened")

                const tds = document.querySelectorAll("tbody td:not(:first-child)");
                Array.from(tds).forEach(curr => {
                    curr.classList.add("hover-td");
                })
            }

            btnClose[1].addEventListener("click", () => {
                hidePopover();
            });


        };

        // Open new schedule popover form
        const openPopover = (function () {

            // Execute the click event for every workers-field
            const btnField = document.querySelectorAll(".workers-field");
            Array.from(btnField).forEach((curr, index) => {

                curr.setAttribute("onclick", "")

                curr.addEventListener("click", e => {
                    if (isFirstPopover) {
                        openPopoverEvent(e, curr, index);
                    }
                });
            });
        }) ();
    }

    const displaySchedule = function(scheduleMap) {

        for (const [key, value] of scheduleMap) {
            const entriesArr = Object.entries(value);
            
            entriesArr.forEach(curr => {
                const primarTdId = `${curr[0].slice(0, curr[0].length - 2)}_${curr[1].start}_${curr[1].end}`;

                const tdId = Number(curr[1].day);
                const parentTr = document.getElementById(primarTdId).parentNode;

                const childTdList = parentTr.querySelectorAll(".workers-field");
                const childTd = childTdList[tdId - 1];

                let color, bgColor;
                switch (key) {
                    case "Danča Š.":
                        color = "#757500";
                        bgColor = "#FFFFED";
                        break;
                    case "Lenka S.":
                        color = "#C45500";
                        bgColor = "#FFE8D6";
                        break;
                    case "Pavla Ho.":
                        color = "#B700B1";
                        bgColor = "#FFDEFE";
                        break;
                    case "Pavla Hl.":
                        color = "#0B4EE3";
                        bgColor = "#E1EAFF";
                        break;
                    case "Katka Š.":
                        color = "#D30007";
                        bgColor = "#FFE1E2";
                        break;
                    case "Nikča Š.":
                        color = "#00822B";
                        bgColor = "#D7FFE4";
                        break;
                    case "Lenka Š.":
                        color = "#007C87";
                        bgColor = "#DBFCFF";
                        break;
                    case "Markéta B.":
                        color = "#D1008B";
                        bgColor = "#FFEDF9";
                        break;                }

                childTd.textContent = key;
                childTd.style.backgroundColor = bgColor;
                childTd.style.color = color;
            })
        }
    }

    const message = (type, msg) => {
        const body = document.querySelector("body");

        const msgItem = document.createElement("div");
        const newPara = document.createElement("p");

        msgItem.appendChild(newPara);
        msgItem.classList.add("msg-item");
        newPara.classList.add("msg-para");
        newPara.textContent = msg;

        switch (type) {
            case "warning":
                newPara.style.backgroundColor = "#ffc107";
                newPara.style.color = "#fff9e3";
                break;
            case "info":
                newPara.style.backgroundColor = "#17a2b8";
                newPara.style.color = "#bdeff7";
                break;
            case "success":
                newPara.style.backgroundColor = "#28a745";
                newPara.style.color = "#edf8ed";
                break;
            case "danger":
                newPara.style.backgroundColor = "#dc3545";
                newPara.style.color = "#fae2e4";
                break;
        }

        body.appendChild(msgItem);

        const elWidth = newPara.offsetWidth;
        const elHeight = newPara.offsetHeight;

        msgItem.style.width = `${elWidth + 40}px`;
        msgItem.style.height = `${elHeight + 5}px`;
      
        newPara.style.width = `${elWidth}px`;
        newPara.style.transform = `translateX(100%)`;
        newPara.style.animation = `slideInfo1 .5s ease-in`;
        setTimeout(() => {
            newPara.style.transform = `translateX(-5px)`;
            msgItem.style.width = `${elWidth + 10}px`;
        }, 500);

        const topPosition = (wasRemoved) => {
            const items = document.querySelectorAll(".msg-item");
            Array.from(items).forEach((item, index) => {
                if (!wasRemoved) {
                    let topRems;
                    index === 0 ? topRems = 1 : topRems = index * 3 + 1;
        
                    item.style.top = `${topRems}rem`;
                } else {
                    console.log(item.style.top);
                }
            });
        };
        topPosition();

        msgItem.style.animation = "fadeOut .5s ease-out 4.5s";

        setTimeout(() => {
            const parentNode = msgItem.parentNode;
            parentNode.removeChild(msgItem);
            topPosition();
        }, 5000);
    };

    // Update date
    const dates = () => {

        const days = Array.from(document.querySelectorAll(".th-days td:not(:first-child)"));
        days.forEach((curr, index) => {
            const para = curr.appendChild(document.createElement("p"));
            para.classList.add("date");

            switch (index) {
                case 0: 
                    const dateBck = curr.appendChild(document.createElement("span"));
                    dateBck.classList.add("date-bck");
                    dateBck.textContent = "<<";
                    break;
                case 6:
                    const dateFwd = curr.appendChild(document.createElement("span"));
                    dateFwd.classList.add("date-fwd");
                    dateFwd.textContent = ">>";
                    break;
            }
        });

        const date = new Date();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        let weekDay = date.getDay();

        weekDay === 0 ? weekDay = 6 : weekDay = weekDay - 1;

        const daysBefore = days.filter((curr, index) => index < weekDay);
        const daysAfter = days.filter((curr, index) => index > weekDay);

        if (daysBefore.length !== 0) {
            daysBefore.forEach((curr, index) => {
                const reducer = daysBefore.length - index;
                const dateReduce = new Date();
                dateReduce.setDate(date.getDate() - reducer);

                curr.childNodes[1].textContent = `${dateReduce.getDate()}.${dateReduce.getMonth() + 1} ${dateReduce.getFullYear()}`;
            })
        };
        if (daysAfter.length !== 0) {
            daysAfter.forEach((curr, index) => {
                const dateIncrease = new Date();
                dateIncrease.setDate(dateIncrease.getDate() + (index + 1));
                dateIncrease.getDate();

                curr.childNodes[1].textContent = `${dateIncrease.getDate()}.${dateIncrease.getMonth() + 1} ${dateIncrease.getFullYear()}`;
            })
        };

        const today = days[weekDay].childNodes[1];
        today.textContent = `${day}.${month} ${year}`;
        today.style.textDecoration = "underline";

        // Change date
        let daysArr = [];
        let count = 0;
        let direction = "";

        const paraList = document.querySelectorAll(".th-days td:not(:first-child) p")

        const changeDateBck = document.querySelector(".date-bck");
        changeDateBck.addEventListener("click", () => {
            if (direction === "" || direction === "bck") {
                
            }
            count += 1;
            changeDate(paraList, daysArr, count);
        });

        const changeDateFwd = document.querySelector(".date-fwd");
        changeDateFwd.addEventListener("click", () => {
            count -= 1;
            changeDate(paraList, daysArr, count);
        });
    };

    const changeDate = (paraList, daysArr, count) => {

        Array.from(paraList).forEach((curr, index, arr) => {
            const getday = +curr.textContent.split(".")[0];
            if (daysArr.length <= 6) {
                daysArr.push(getday);
            }
            const date = new Date();
            date.setDate(daysArr[index] - 7 * count);
            const month = date.getMonth() + 1;
            const year = date.getFullYear();

            curr.textContent = `${date.getDate()}.${month} ${date.getFullYear()}`;
        })
    };

    const print = (refreshSchedule, refreshClients) => {
        const btn = document.querySelector(".btn-print");
        btn.addEventListener("click", () => {
            const html = document.querySelector("html");
            const oldBody = document.querySelector("body").cloneNode(true);
            const body = document.querySelector("body");
            const table = document.querySelector(".table-schedule");
            
            document.querySelector(".date-bck").style.display = "none";
            document.querySelector(".date-fwd").style.display = "none";
            Array.from(document.querySelectorAll(".client-list")).forEach(curr => curr.classList.add("print"));

            body.innerHTML = "";
            body.appendChild(table);
            body.style.padding = ".5rem .5rem 0 .5rem";
            window.print();
            location.reload();
        })
    }



    // Returned data
    return {
        getInputData: inputData,
        getButtons: buttons,
        generateTableLayout,
        newSchedule,
        displaySchedule,
        message,
        dates,
        print, 

    };
}; 

///////////////// App controller //////////////////
const controll = function(UI, load)  {

    // Save client
    UI().getButtons.newClientConfirm.addEventListener("click", () => addNewClient());
    // Send new client to processData and save
    function addNewClient() {
        // Create new client data using constructor
        const [newData, docName] = processData.receiveNewClient(UI().getInputData());
        // Save new client to firestore
        if (newData && docName) {
            saveData.newClient(newData, docName);
            refreshClients();
            refreshSchedule();

            UI().message("success", "Nový klient úspěšně přidan.")

        } else {
            UI().message("warning", "Nebylo zadáno jméno, začátek, nebo konec asistence")
        }
    };

    // Remove client
    const removeClient = () => {
        const removeBtn = document.querySelectorAll(".remove-client-box");
        Array.from(removeBtn).forEach(curr => {
            curr.addEventListener("click", (e) => {
                // Start event async bcz need to pass schedule
                const scheduleData = load().getSchedule;
                scheduleData.then((scheduleMap) => {
                    eventRemoveClient(e, scheduleMap);
                })
            })
        });
        function eventRemoveClient(e, scheduleMap) {
            if (confirm("Opravdu odstranit?")) {
                remove.client(e.target.parentNode.parentNode.parentNode.id, scheduleMap);

                UI().message("danger", "Klient odstraněn.")

                refreshClients();
                refreshSchedule();
            }
        };
    }
    
    // Refresh Clients UI
    function refreshClients() {
        // Load client data and UI async
        const clientData = load().getClients;
        clientData.then(result => {

            const tr = document.querySelectorAll("tbody tr");
            Array.from(tr).forEach(curr => {
                curr.remove();
            })
            
            // Create table layout
            UI().generateTableLayout(result);

            // Load btns for removing clients
            removeClient();

        });
    };
    // Refresh Schedule UI
    function refreshSchedule() {
        // Load schedule data async
        const scheduleData = load().getSchedule;
        scheduleData.then(result => {

            // Callback with result of new schedule
            function newScheduleConfirmed(ids, save) {

                // If ids, then SAVE, else REMOVE
                if (save) {
                    // Create schedule object
                    const newSchedule = processData.newSchedule(ids, result, UI().message);
                    // Save schedule object
                    saveData.saveSchedule(newSchedule);
                } else {
                    // Delete schedule
                    remove.schedule(ids);
                    UI().message("danger", "Asistence zrušena.")

                }
                
                // Refresh UI schedule
                refreshClients();
                refreshSchedule();
            };

            // Click event - open schedule form
            UI().newSchedule(result, newScheduleConfirmed);
            UI().displaySchedule(result);

        })
    };

    function init() {
       // console.clear();
        console.log(`App is running..`);
        refreshClients();
        refreshSchedule();

        // Set dates to days
        UI().dates();
        // Print event
        UI().print(refreshSchedule, refreshClients);
    }
/////////// Run the commands /////////////////
    init();
};

controll(UIManipulation, loadData);





































/*
const body = document.querySelector("body");
const thead = document.querySelector("thead");


function yek() {

    return new Promise((resolve, reject) => {

        body.addEventListener("click", () => {
            console.log("clicked");

            resolve("first");
        })
    })
};

yek().then(prom1 => {

    console.log(prom1); 

    thead.addEventListener("click", () => {
        resolve("second");
    })
}).then(prom2 => {
    console.log(prom2);
});

*/


































/*
////////// Insert multiple time for one client /////////////////
const hours = Array.from(document.querySelectorAll(".hours"));
let count = 0;

const newHours = hours.map((curr, index) => {

    const setAttributes = function(attrs) {
        for (const key in attrs) {
            let currClone = curr.cloneNode();
            currClone.setAttribute(key, attrs[key]);
            currClone.classList.remove("hours");

            return currClone;
        }
    }



    switch (index) {
        case 0: count++;
                console.log(count);
                return setAttributes({"for": "time2s", "class": "form-label"});
        break;
        case 1: return setAttributes({"id": "time2s", "class": "border-0 border-bottom bg-light p-2"});
        break;
        case 2: return setAttributes({"for": "time2e", "class": "form-label ml-5"});
        break;
        case 3: return setAttributes({"id": "time2e", "class": "border-0 border-bottom bg-light p-2"});
        break;
    }
})
console.log(newHours);

const test = document.querySelectorAll(".test > input");

console.log(test);
*/