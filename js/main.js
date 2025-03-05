// Instantiate and render the bubble chart
const bubbleChart = new BubbleChart({
    container: "#chart",
    dataPath: "data/vis1.csv",
    margin: 50
});
bubbleChart.render();

// Instantiate and render the bar chart
const barChart = new BarChart({
    dataPath: "data/vis2.csv",
    container: "#barChart",
    width: 900,
    height: 500,
    margin: { top: 20, right: 20, bottom: 60, left: 60 }
});
barChart.render();

