class BarChartRace {
    constructor(parentElement, data) {
        this.parentElement = parentElement;
        this.data = data;
        this.topN = 15;
        this.duration = 100;
        this.initVis();
    }

    initVis() {
        let vis = this;
        // margin conventions
        vis.margin = { top: 30, right: 20, bottom: 20, left: 30 };
        vis.width =
            document.getElementById(vis.parentElement).getBoundingClientRect()
                .width -
            vis.margin.left -
            vis.margin.right;
        vis.height =
            document.getElementById(vis.parentElement).getBoundingClientRect()
                .height -
            vis.margin.top -
            vis.margin.bottom;

        // init drawing area
        vis.svg = d3
            .select("#" + vis.parentElement)
            .append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr(
                "transform",
                "translate(" + vis.margin.left + "," + vis.margin.top + ")"
            );

        vis.chartArea = vis.svg.append("g").attr("clip-path", "url(#clip)");

        vis.svg
            .append("defs")
            .append("clipPath")
            .attr("id", "clip")
            .append("rect")
            .attr("width", vis.width)
            .attr("height", vis.height);

        vis.xScale = d3.scaleLinear().range([0, vis.width]);
        vis.yScale = d3.scaleBand().range([0, vis.height]).padding(0.1);

        vis.xAxis = vis.svg.append("g").attr("transform", "translate(0,0)");

        vis.gridLines = vis.chartArea.append("g").attr("class", "grid-lines");

        vis.dateLabel = vis.svg
            .append("text")
            .attr("class", "date-label")
            .attr("x", vis.width)
            .attr("y", vis.height)
            .attr("text-anchor", "end")
            .text("date label")
            .attr("fill", "white")
            .attr("font-size", "20px");

        this.wrangleData(0); // Initialize with first frame
    }

    wrangleData(index) {
        let vis = this;
        vis.displayData = {
            songs: vis.data[index].songs.slice(0, vis.topN),
            date: vis.data[index].date,
        };
        vis.updateVis();
    }

    updateVis() {
        let vis = this;
        let songsData = vis.displayData.songs;

        vis.xScale.domain([0, d3.max(songsData, (d) => d.streams) * 1.15]);
        vis.yScale.domain(songsData.map((d) => d.track));

        let gridLines = vis.gridLines
            .selectAll(".grid-line")
            .data(vis.xScale.ticks(10));

        gridLines
            .enter()
            .append("line")
            .attr("class", "grid-line")
            .merge(gridLines)
            .transition()
            .duration(vis.duration)
            .attr("x1", (d) => vis.xScale(d))
            .attr("x2", (d) => vis.xScale(d))
            .attr("y1", 0)
            .attr("y2", vis.height)
            .attr("stroke", "rgba(255, 255, 255, 0.1)")
            .attr("stroke-width", 1);

        gridLines.exit().remove();

        vis.xAxis
            .transition()
            .duration(vis.duration)
            .call(
                d3
                    .axisTop(vis.xScale)
                    .tickFormat((d) => `${(d / 1000000).toFixed(1)}M`)
            );

        let bars = vis.chartArea
            .selectAll(".bar")
            .data(songsData, (d) => d.track);

        bars.enter()
            .append("rect")
            .attr("class", "bar")
            .attr("height", vis.yScale.bandwidth())
            .attr("x", 0)
            .attr("y", vis.height)
            .attr("width", 0)
            .attr("fill", (d) => {
                if (d.is_solo) {
                    return "#ff5e7c";
                } else {
                    return "#4cc764";
                }
            })
            .merge(bars)
            .transition()
            .duration(vis.duration)
            .attr("y", (d) => vis.yScale(d.track))
            .attr("width", (d) => vis.xScale(d.streams));

        bars.exit().remove();

        let songlabels = vis.chartArea
            .selectAll(".song-label")
            .data(songsData, (d) => d.track);

        songlabels
            .enter()
            .append("text")
            .attr("class", "song-label")
            .attr("fill", "white")
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "middle")
            .attr("y", (d) => vis.height + vis.yScale.bandwidth() / 2)
            .merge(songlabels)
            .transition()
            .duration(vis.duration)
            .attr("x", (d) => vis.xScale(d.streams) - 10)
            .attr("y", (d) => vis.yScale(d.track) + vis.yScale.bandwidth() / 2)
            .text((d) => d.artist + " - " + d.track);

        songlabels.exit().remove();

        vis.dateLabel.text(vis.displayData.date);

        let streamLabels = vis.svg.selectAll(".stream-label").data(songsData);

        streamLabels
            .enter()
            .append("text")
            .attr("class", "stream-label")
            .attr("fill", "white")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "middle")
            .attr("y", (d) => vis.height + vis.yScale.bandwidth() / 2)
            .merge(streamLabels)
            .transition()
            .duration(vis.duration)
            .attr("x", (d) => vis.xScale(d.streams) + 10)
            .attr("y", (d) => vis.yScale(d.track) + vis.yScale.bandwidth() / 2)
            .text((d) => d.streams.toLocaleString());

        streamLabels.exit().remove();
    }
}
