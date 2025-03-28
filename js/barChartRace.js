class BarChartRace {
    constructor(parentElement, data) {
        this.parentElement = parentElement;
        this.data = data;
        this.topN = 15;
        this.duration = 160;
        this.initVis();
    }

    initVis() {
        let vis = this;
        // margin conventions
        vis.margin = { top: 20, right: 30, bottom: 30, left: 30 };
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

        console.log(
            document.getElementById(vis.parentElement).getBoundingClientRect()
                .height
        );

        vis.referenceHeight = 600;
        vis.scaleFactor = vis.height / vis.referenceHeight;

        // init drawing area
        vis.svg = d3
            .select("#" + vis.parentElement)
            .append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr(
                "transform",
                "translate(" +
                    vis.margin.left +
                    "," +
                    vis.margin.top +
                    ") scale(" +
                    vis.scaleFactor +
                    ")"
            );

        vis.effectiveWidth = vis.width / vis.scaleFactor;
        vis.effectiveHeight = vis.height / vis.scaleFactor;

        vis.chartArea = vis.svg.append("g").attr("clip-path", "url(#clip)");

        vis.textArea = vis.svg.append("g");

        vis.svg
            .append("defs")
            .append("clipPath")
            .attr("id", "clip")
            .append("rect")
            .attr("width", vis.effectiveWidth)
            .attr("height", vis.effectiveHeight);

        // clip area for song labels
        vis.svg
            .select("defs")
            .append("clipPath")
            .attr("id", "textClip")
            .append("rect")
            .attr("height", vis.effectiveHeight);

        vis.xScale = d3.scaleLinear().range([0, vis.effectiveWidth]);
        vis.yScale = d3
            .scaleBand()
            .range([0, vis.effectiveHeight])
            .padding(0.1);
        vis.colorScale = d3
            .scaleOrdinal()
            .range([window.SOLO_COLOR, window.COLLAB_COLOR])
            .domain([true, false]);
        vis.xAxis = vis.svg
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", "translate(0,0)");

        vis.gridLines = vis.chartArea.append("g").attr("class", "grid-lines");

        vis.dateLabel = vis.svg
            .append("text")
            .attr("class", "date-label")
            .attr("x", vis.effectiveWidth)
            .attr("y", vis.effectiveHeight)
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "bottom")
            .text("date label")
            .attr("fill", "white");
        // .attr("font-size", 20 / vis.scaleFactor + "px");

        // this.createLegend();
        this.wrangleData(0);
    }

    createLegend() {
        let vis = this;
        // Add legend as a group
        let legendSize = 13;
        let legendTextOffset = 5;
        let legendSpacing = 105;

        // Create a group for the entire legend
        let legendGroup = vis.svg
            .append("g")
            .attr("class", "legend-group")
            .attr("transform", "translate(0, -40)");

        // create solo square
        legendGroup
            .append("rect")
            .attr("width", legendSize)
            .attr("height", legendSize)
            .attr("fill", window.SOLO_COLOR);

        // create solo text
        legendGroup
            .append("text")
            .attr("class", "legend-text")
            .attr("x", legendSize + legendTextOffset)
            .attr("y", legendSize / 2)
            .attr("dominant-baseline", "central")
            .text("Solo Song");

        // create collaboration square
        legendGroup
            .append("rect")
            .attr("x", legendSize + legendTextOffset + legendSpacing)
            .attr("width", legendSize)
            .attr("height", legendSize)
            .attr("fill", window.COLLAB_COLOR);

        // create collaboration text
        legendGroup
            .append("text")
            .attr("class", "legend-text")
            .attr(
                "x",
                legendSize +
                    legendTextOffset +
                    legendSpacing +
                    legendSize +
                    legendTextOffset
            )
            .attr("y", legendSize / 2)
            .attr("dominant-baseline", "central")
            .text("Collaboration Song");
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
            .attr("y2", vis.effectiveHeight)
            .style("stroke-dasharray", "4,4");

        gridLines.exit().remove();

        vis.xAxis
            .transition()
            .duration(vis.duration)
            .call(
                d3
                    .axisTop(vis.xScale)
                    .tickFormat((d) => `${(d / 1000000).toFixed(1)}M`)
            );

        let albumCovers = vis.chartArea
            .selectAll(".album-cover")
            .data(songsData, (d) => d.track);

        const imageSize = vis.yScale.bandwidth();

        albumCovers
            .enter()
            .append("image")
            .attr("class", "album-cover")
            .attr("xlink:href", (d) => `../data/album_cover/${d.id}.jpg`)
            .attr("height", imageSize)
            .attr("width", imageSize)
            .attr("y", vis.effectiveHeight)
            .attr("x", 0)
            .merge(albumCovers)
            .transition()
            .duration(vis.duration)
            .attr(
                "y",
                (d) =>
                    vis.yScale(d.track) +
                    (vis.yScale.bandwidth() - imageSize) / 2
            )
            .attr("x", 0);

        albumCovers.exit().remove();

        let bars = vis.chartArea
            .selectAll(".bar")
            .data(songsData, (d) => d.track);

        bars.enter()
            .append("rect")
            .attr("class", "bar")
            .attr("height", vis.yScale.bandwidth())
            .attr("x", imageSize + 0.1 * vis.yScale.bandwidth())
            .attr("y", vis.effectiveHeight)
            .attr("width", 0)
            .attr("fill", (d) => vis.colorScale(d.is_solo))
            .attr("opacity", 1)
            .merge(bars)
            .transition()
            .duration(vis.duration)
            .attr("y", (d) => vis.yScale(d.track))
            .attr("x", imageSize + 0.1 * vis.yScale.bandwidth())
            .attr("width", (d) => vis.xScale(d.streams) - imageSize);

        bars.exit().remove();

        vis.svg.selectAll(".text-clip-rect").remove();

        songsData.forEach((d) => {
            vis.svg
                .select("#textClip")
                .append("rect")
                .attr("class", "text-clip-rect")
                .attr("x", imageSize + 0.1 * vis.yScale.bandwidth())
                .attr("y", vis.yScale(d.track))
                .attr(
                    "width",
                    vis.xScale(d.streams) -
                        imageSize -
                        0.1 * vis.yScale.bandwidth()
                )
                .attr("height", vis.yScale.bandwidth());
        });

        let songlabels = vis.textArea
            .selectAll(".song-label")
            .data(songsData, (d) => d.track);

        songlabels
            .enter()
            .append("text")
            .attr("class", "song-label")
            .attr("fill", "white")
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "middle")
            .attr("clip-path", "url(#textClip)")
            .attr("y", (d) => vis.effectiveHeight + vis.yScale.bandwidth() / 2)
            .merge(songlabels)
            .transition()
            .duration(vis.duration)
            .attr("x", (d) => vis.xScale(d.streams) - 10)
            .attr("y", (d) => vis.yScale(d.track) + vis.yScale.bandwidth() / 2)
            .text((d) => d.artist + " - " + d.track);

        songlabels.exit().remove();

        vis.dateLabel.text(vis.displayData.date);

        let streamLabels = vis.textArea
            .selectAll(".stream-label")
            .data(songsData);

        streamLabels
            .enter()
            .append("text")
            .attr("class", "stream-label")
            .attr("fill", "white")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "middle")
            .attr("y", (d) => vis.effectiveHeight + vis.yScale.bandwidth() / 2)
            .merge(streamLabels)
            .transition()
            .duration(vis.duration)
            .attr("x", (d) => vis.xScale(d.streams) + 10)
            .attr("y", (d) => vis.yScale(d.track) + vis.yScale.bandwidth() / 2)
            .text((d) => d.streams.toLocaleString());

        streamLabels.exit().remove();
    }
}
