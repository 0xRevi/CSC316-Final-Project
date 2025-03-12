class LineChartTimeline {
    constructor(parentElement, data) {
        this.parentElement = parentElement;
        this.data = data;
        this.initVis();
    }

    initVis() {
        let vis = this;

        this.currentIndex = 0;

        vis.margin = { top: 10, right: 20, bottom: 20, left: 35 };
        vis.width =
            document.getElementById(vis.parentElement).getBoundingClientRect()
                .width -
            vis.margin.left -
            vis.margin.right;
        vis.height = 150 - vis.margin.top - vis.margin.bottom;

        vis.svg = d3
            .select("#" + vis.parentElement)
            .append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr(
                "transform",
                `translate(${vis.margin.left},${vis.margin.top})`
            );

        vis.xScale = d3
            .scaleTime()
            .domain(d3.extent(vis.data, (d) => new Date(d.date)))
            .range([0, vis.width]);

        vis.yScale = d3.scaleLinear().domain([0, 1]).range([vis.height, 0]);
        vis.colorScale = d3
            .scaleOrdinal()
            .range(["#FF6961", "#77DD77"])
            .domain([false, true]);

        this.createBackgroundIntervals();
        vis.backgroundIntervalGroup = vis.svg
            .append("g")
            .attr("class", "background-intervals");

        vis.lineGenerator = d3
            .line()
            .x((d) => vis.xScale(new Date(d.date)))
            .y((d) => vis.yScale(d.collaborationProportion))
            .curve(d3.curveCardinal.tension(0.1));

        // add x-axis lines
        vis.svg
            .append("g")
            .attr("class", "grid-lines")
            .selectAll(".grid-line-x")
            .data(vis.xScale.ticks())
            .enter()
            .append("line")
            .attr("class", "grid-line-x")
            .attr("x1", (d) => vis.xScale(d))
            .attr("x2", (d) => vis.xScale(d))
            .attr("y1", 0)
            .attr("y2", vis.height);

        vis.xAxis = vis.svg
            .append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0,${vis.height})`);

        vis.yAxis = vis.svg.append("g").attr("class", "axis y-axis");

        vis.xAxis.call(d3.axisBottom(vis.xScale));
        vis.yAxis.call(
            d3
                .axisLeft(vis.yScale)
                .tickValues([0, 0.25, 0.5, 0.75, 1])
                .tickFormat(d3.format(".1f"))
        );

        // path for line plot
        vis.path = vis.svg
            .append("path")
            .attr("class", "timeline-path")
            .attr("fill", "none")
            .attr("stroke", "#4287f5")
            .attr("stroke-width", 2);

        // indicator line for current index
        vis.indicatorLine = vis.svg
            .append("line")
            .attr("class", "indicator-line")
            .attr("y1", 0)
            .attr("y2", vis.height);

        // dot at end of line path
        vis.dot = vis.svg.append("circle").attr("class", "timeline-dot");

        this.wrangleData(0);
    }

    createBackgroundIntervals() {
        let vis = this;

        vis.intervals = [];
        let currentInterval = null;

        vis.data.forEach((d, i) => {
            const isCollab = !d.songs[0].is_solo;
            const startDate = new Date(d.date);
            const endDate =
                i < vis.data.length - 1
                    ? new Date(vis.data[i + 1].date)
                    : new Date(startDate);

            if (!currentInterval || currentInterval.isCollab !== isCollab) {
                currentInterval = {
                    startDate,
                    endDate,
                    isCollab,
                    isLast: i === vis.data.length - 1,
                };
                vis.intervals.push(currentInterval);
            } else {
                currentInterval.endDate = endDate;
                currentInterval.isLast = i === vis.data.length - 1;
            }
        });
    }

    wrangleData(currentIndex) {
        let vis = this;
        vis.currentIndex = currentIndex;

        vis.timelineData = vis.data.slice(0, currentIndex + 1).map((d) => ({
            date: d.date,
            collaborationProportion:
                d.songs.slice(0, 15).filter((song) => !song.is_solo).length /
                15,
        }));

        this.updateVis();
    }

    updateVis() {
        let vis = this;

        // update indicator line
        const currentDate = new Date(vis.data[vis.currentIndex].date);

        // add background intervals
        let backgroundIntervals = vis.backgroundIntervalGroup
            .selectAll("rect")
            .data(vis.intervals);

        backgroundIntervals
            .enter()
            .append("rect")
            .merge(backgroundIntervals)
            .attr("x", (d) => vis.xScale(d.startDate))
            .attr("width", (d) =>
                d.isLast
                    ? vis.width - vis.xScale(d.startDate)
                    : vis.xScale(d.endDate) - vis.xScale(d.startDate)
            )
            .attr("y", 0)
            .attr("height", vis.height)
            .attr("fill", (d) => vis.colorScale(d.isCollab))
            .transition()
            .duration(100)
            .attr("opacity", (d) => {
                return currentDate >= d.startDate && currentDate <= d.endDate
                    ? 0.5
                    : 0.1;
            });

        backgroundIntervals.exit().remove();

        vis.indicatorLine
            .attr("x1", vis.xScale(currentDate))
            .attr("x2", vis.xScale(currentDate))
            .style("visibility", "visible");

        // update line path and dot
        vis.path.datum(vis.timelineData).attr("d", vis.lineGenerator);
        const lastPoint = vis.timelineData[vis.timelineData.length - 1];
        vis.dot
            .attr("cx", vis.xScale(new Date(vis.data[vis.currentIndex].date)))
            .attr("cy", vis.yScale(lastPoint.collaborationProportion));
    }
}
