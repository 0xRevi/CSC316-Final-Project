/* * * * * * * * * * * * * *
 *           MAIN           *
 * * * * * * * * * * * * * */

function updateAllVisualizations() {
    myPieChart.wrangleData();
    myMapVis.wrangleData();
}

// load data using promises
let promises = [d3.json("data/chart_data.json")];

Promise.all(promises)
    .then(function (data) {
        initMainPage(data);
    })
    .catch(function (err) {
        console.log(err);
    });

// initMainPage
function initMainPage(data) {
    // log data
    window.timeControllerInstance = new TimeController(data[0]);
}
