class BubbleChart {
    constructor(config) {
        this.parentElement = config.parentElement;
        this.dataPath = config.dataPath;
        this.k = config.k || 2000;
        this.data = null;
        this.initVis();
    }

    async initVis() {
        let vis = this;
        vis.data = await vis.loadData();
        console.log(vis.data);

        d3.select("#" + vis.parentElement)
            .select("svg")
            .remove();

        vis.margin = { top: 0, right: 125, bottom: 0, left: 0 };
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

        vis.referenceHeight = 650;
        vis.scaleFactor = vis.height / vis.referenceHeight;

        console.log(
            document.getElementById(vis.parentElement).getBoundingClientRect()
                .width,
            document.getElementById(vis.parentElement).getBoundingClientRect()
                .height
        );

        vis.svg = d3
            .select("#" + vis.parentElement)
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${vis.width} ${vis.height}`)
            .style("display", "block");

        // group for all elements and apply scaling
        vis.container = vis.svg
            .append("g")
            .attr(
                "transform",
                `translate(${vis.margin.left},${vis.margin.top}) scale(${vis.scaleFactor})`
            );

        vis.effectiveWidth = vis.width / vis.scaleFactor;
        vis.effectiveHeight = vis.height / vis.scaleFactor;

        // define scales
        const xExtent = d3.extent(vis.data, (d) => d.releaseDate);
        vis.xScale = d3
            .scaleTime()
            .domain(xExtent)
            .range([0, vis.effectiveWidth]);

        const rExtent = d3.extent(vis.data, (d) => d.total_streams);

        vis.radiusScale = d3.scaleSqrt().domain(rExtent).range([5, 23]);

        vis.colorScale = d3
            .scaleOrdinal()
            .domain(["Solo", "Collaboration"])
            .range([window.SOLO_COLOR, window.COLLAB_COLOR]);

        // vis.renderLegendPage();
        vis.renderChart();
    }

    loadData() {
        let vis = this;
        return new Promise((resolve, reject) => {
            d3.csv(vis.dataPath).then((data) => {
                let processedData = data.filter((d) => +d.chart_days >= 7);
                processedData = processedData
                    .sort((a, b) => b.total_streams - a.total_streams)
                    .slice(0, vis.k);
                processedData = processedData.filter(
                    (d) => new Date(d.release_date).getFullYear() >= 2017
                );

                // convert numeric
                processedData.forEach((d, i) => {
                    if (!d.id) d.id = i;
                    d.best_date_decimal = +d.best_date_decimal;
                    d.chart_days = +d.chart_days;
                    d.total_streams = +d.total_streams;
                    // parse release_date into a Date object
                    d.releaseDate = d.release_date
                        ? new Date(d.release_date)
                        : null;
                    d.release_year = d.release_date
                        ? new Date(d.release_date).getFullYear()
                        : "Unknown";
                });

                resolve(processedData);
            });
        });
    }

    renderLegendPage() {
        let vis = this;
        const centerX = vis.effectiveWidth / 2;
        const centerY = vis.effectiveHeight / 2 - 100;
        const circleRadius = 23;
        const circleSpacing = 180;

        const legendGroup = vis.container
            .append("g")
            .attr("class", "legend-group");

        const title = legendGroup
            .append("text")
            .attr("x", centerX)
            .attr("y", centerY - 100)
            .attr("text-anchor", "middle")
            .attr("font-size", "24px")
            .attr("font-weight", "bold")
            .attr("fill", "white")
            .text(`Top ${vis.k} Songs on Spotify`)
            .style("opacity", 0);

        title.transition().duration(800).style("opacity", 1);

        const subtitle = legendGroup
            .append("text")
            .attr("x", centerX)
            .attr("y", centerY - 60)
            .attr("text-anchor", "middle")
            .attr("font-size", "18px")
            .attr("fill", "white")
            .text("This chart shows songs grouped by type:")
            .style("opacity", 0);

        subtitle.transition().delay(600).duration(800).style("opacity", 1);

        const soloCircle = legendGroup
            .append("circle")
            .attr("cx", centerX - circleSpacing / 2)
            .attr("cy", centerY)
            .attr("r", 0)
            .attr("fill", window.SOLO_COLOR)
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("opacity", 0.9);

        soloCircle
            .transition()
            .delay(1200)
            .duration(800)
            .attr("r", circleRadius);

        const soloText = legendGroup
            .append("text")
            .attr("x", centerX - circleSpacing / 2)
            .attr("y", centerY + circleRadius + 30)
            .attr("text-anchor", "middle")
            .attr("font-size", "16px")
            .attr("fill", "white")
            .text("Solo Songs")
            .style("opacity", 0);

        soloText.transition().delay(1400).duration(600).style("opacity", 1);

        const collabCircle = legendGroup
            .append("circle")
            .attr("cx", centerX + circleSpacing / 2)
            .attr("cy", centerY)
            .attr("r", 0)
            .attr("fill", window.COLLAB_COLOR)
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("opacity", 0.9);

        collabCircle
            .transition()
            .delay(1600)
            .duration(800)
            .attr("r", circleRadius);

        const collabText = legendGroup
            .append("text")
            .attr("x", centerX + circleSpacing / 2)
            .attr("y", centerY + circleRadius + 30)
            .attr("text-anchor", "middle")
            .attr("font-size", "16px")
            .attr("fill", "white")
            .text("Collaboration Songs")
            .style("opacity", 0);

        collabText.transition().delay(1800).duration(600).style("opacity", 1);

        const sizeTitle = legendGroup
            .append("text")
            .attr("x", centerX)
            .attr("y", centerY + 100)
            .attr("text-anchor", "middle")
            .attr("font-size", "18px")
            .attr("fill", "white")
            .text("Bubble size represents total streams on Spotify:")
            .style("opacity", 0);

        sizeTitle.transition().delay(2400).duration(800).style("opacity", 1);

        const sizeLegendY = centerY + 160;
        const streamDomain = vis.radiusScale.domain();
        const minRadius = vis.radiusScale.range()[0];
        const maxRadius = vis.radiusScale.range()[1];
        const radiusSizes = d3.range(
            minRadius,
            maxRadius,
            (maxRadius - minRadius) / 4
        );
        const streamValues = radiusSizes.map((radius) => {
            return Math.round(vis.radiusScale.invert(radius));
        });

        const bubbleSpacing = 90;
        const labelOffset = 40;

        const totalBubblesWidth = (radiusSizes.length - 1) * bubbleSpacing;
        const sizeLegendStartX = centerX - totalBubblesWidth / 2;

        radiusSizes.forEach((r, i) => {
            const xPos = sizeLegendStartX + i * bubbleSpacing;
            const animationDelay = 2800 + i * 200;
            const bubble = legendGroup
                .append("circle")
                .attr("cx", xPos)
                .attr("cy", sizeLegendY)
                .attr("r", 0)
                .attr("fill", "#6a9eff")
                .attr("fill-opacity", 0.8)
                .attr("stroke", "white")
                .attr("stroke-width", 1);

            bubble
                .transition()
                .delay(animationDelay)
                .duration(600)
                .attr("r", r);

            const formattedValue = d3
                .format(".2s")(streamValues[i])
                .replace("G", "B");

            const label = legendGroup
                .append("text")
                .attr("x", xPos)
                .attr("y", sizeLegendY + labelOffset)
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .attr("fill", "white")
                .text(formattedValue)
                .style("opacity", 0);

            label
                .transition()
                .delay(animationDelay + 300)
                .duration(400)
                .style("opacity", 1);
        });

        const buttonBg = legendGroup
            .append("rect")
            .attr("x", centerX - 150)
            .attr("y", centerY + 220)
            .attr("width", 300)
            .attr("height", 40)
            .attr("rx", 20)
            .attr("ry", 20)
            .attr("fill", "#333")
            .attr("stroke", "#555")
            .attr("stroke-width", 1)
            .attr("opacity", 0);

        buttonBg.transition().delay(3800).duration(800).attr("opacity", 0.7);

        const buttonText = legendGroup
            .append("text")
            .attr("x", centerX)
            .attr("y", centerY + 245)
            .attr("text-anchor", "middle")
            .attr("font-size", "16px")
            .attr("fill", "white")
            .attr("cursor", "pointer")
            .text("Click anywhere to continue")
            .style("opacity", 0);

        buttonText.transition().delay(4000).duration(800).style("opacity", 0.9);

        const clickOverlay = vis.container
            .append("rect")
            .attr("width", vis.effectiveWidth)
            .attr("height", vis.effectiveHeight)
            .attr("fill", "transparent")
            .style("cursor", "pointer")
            .on("click", () => {
                // render the chart before fading out the legend
                vis.renderChart();

                legendGroup
                    .transition()
                    .duration(100)
                    .style("opacity", 0)
                    .on("end", () => {
                        legendGroup.remove();
                        clickOverlay.remove();
                    });
            });
    }

    renderChart() {
        let vis = this;

        const tooltip = d3.select("#tooltip");

        // chart group for all elements with initial opacity of 0
        const chartGroup = vis.container
            .append("g")
            .attr("class", "chart-group")
            .style("opacity", 0);

        const boundaryY = vis.effectiveHeight * 0.5;
        const boundaryPadding = 40;

        vis.data.forEach((d) => {
            d.x = vis.xScale(d.releaseDate);

            const yNoise = Math.random() * 0;
            // start at the boundary line with padding based
            if (d.song_type === "Solo") {
                d.y =
                    boundaryY -
                    vis.radiusScale(d.total_streams) -
                    boundaryPadding -
                    yNoise;
            } else {
                d.y =
                    boundaryY +
                    vis.radiusScale(d.total_streams) +
                    boundaryPadding +
                    yNoise;
            }
        });

        const gridGroup = chartGroup.append("g").attr("class", "grid-lines");

        const circles = chartGroup
            .selectAll(".bubble")
            .data(vis.data)
            .join("circle")
            .attr("class", "bubble")
            .attr("r", (d) => vis.radiusScale(d.total_streams))
            .attr("fill", (d) => vis.colorScale(d.song_type))
            .attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y)
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .on("mouseover", (event, d) => {
                tooltip
                    .style("opacity", 1)
                    .html(
                        `<strong>${d.song_name}</strong><br/>${d.Artist} [${d.release_year}]<br/>#${d.chart_days} days in Top 200`
                    );
            })
            .on("mousemove", (event) => {
                tooltip
                    .style("left", event.pageX + 10 + "px")
                    .style("top", event.pageY + 10 + "px");
            })
            .on("mouseout", () => {
                tooltip.style("opacity", 0);
            });

        const simulation = d3
            .forceSimulation(vis.data)
            .alpha(1)
            .alphaMin(0.001)
            .alphaDecay(0.15)
            .velocityDecay(0.3)
            .force(
                "xBoundary",
                xBoundaryForce(0, vis.effectiveWidth, vis.radiusScale)
            )
            .force(
                "yBoundary",
                yBoundaryForce(boundaryY, vis.radiusScale, boundaryPadding)
            );

        // immediately re-group by song_type
        simulation
            .force(
                "x",
                d3.forceX((d) => vis.xScale(d.releaseDate)).strength(10)
            ) // high strength to keep x-coord in line with releaseDate
            .force(
                "y",
                d3
                    .forceY((d) =>
                        d.song_type === "Solo"
                            ? boundaryY -
                              vis.radiusScale(d.total_streams) -
                              boundaryPadding
                            : boundaryY +
                              vis.radiusScale(d.total_streams) +
                              boundaryPadding
                    )
                    .strength(0.5)
            ) // force which keeps bubbles compact (squished together)
            .force(
                "collide",
                d3
                    .forceCollide((d) => vis.radiusScale(d.total_streams) + 1)
                    .strength(1)
                    .iterations(3)
            )
            .restart();

        // get all unique years from the data
        const years = [...new Set(vis.data.map((d) => d.release_year))]
            .filter((year) => year !== "Unknown")
            .sort((a, b) => a - b);

        const textPadding = 15; // padding around the text for gridlines

        // upper gridlines
        gridGroup
            .selectAll(".grid-line-upper")
            .data(years)
            .enter()
            .append("line")
            .attr("class", "grid-line-upper")
            .attr("x1", (d) => vis.xScale(new Date(d, 0, 1))) // jan 1st of the year
            .attr("x2", (d) => vis.xScale(new Date(d, 0, 1)))
            .attr("y1", 0)
            .attr("y2", boundaryY - textPadding)
            .attr("stroke", "#555")
            .attr("stroke-width", 0.5)
            .attr("stroke-dasharray", "3,3")
            .attr("opacity", 0.5);

        // lower gridlines
        gridGroup
            .selectAll(".grid-line-lower")
            .data(years)
            .enter()
            .append("line")
            .attr("class", "grid-line-lower")
            .attr("x1", (d) => vis.xScale(new Date(d, 0, 1))) // jan 1st of the year
            .attr("x2", (d) => vis.xScale(new Date(d, 0, 1)))
            .attr("y1", boundaryY + textPadding)
            .attr("y2", vis.effectiveHeight)
            .attr("stroke", "#555")
            .attr("stroke-width", 0.5)
            .attr("stroke-dasharray", "3,3")
            .attr("opacity", 0.5);

        // add year labels
        years.forEach((year) => {
            chartGroup
                .append("text")
                .attr("x", vis.xScale(new Date(year, 0, 1))) // jan 1st of the year
                .attr("y", boundaryY)
                .attr("dy", "0.35em") // center text vertically
                .attr("text-anchor", "middle")
                .attr("font-weight", "bold")
                .attr("font-style", "italic")
                .attr("font-size", "16px")
                .attr("fill", "white")
                .text(year);
        });

        let tickCounter = 0;
        simulation.on("tick", () => {
            tickCounter++;
            // update positions less frequently during high-energy phase
            if (simulation.alpha() > 0.3 && tickCounter % 10 !== 0) return;

            circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
        });

        chartGroup.transition().duration(2000).style("opacity", 1);

        return chartGroup;
    }
}

// prevents bubbles from going out of bounds on the x-axis
function xBoundaryForce(minX, maxX, radiusScale) {
    let nodes;
    function force() {
        for (let i = 0; i < nodes.length; i++) {
            const d = nodes[i];
            const r = radiusScale(d.total_streams);
            if (d.x < minX + r) d.x = minX + r;
            else if (d.x > maxX - r) d.x = maxX - r;
        }
    }
    force.initialize = function (_nodes) {
        nodes = _nodes;
    };
    return force;
}

// prevents bubbles from going out of bounds on the y-axis
function yBoundaryForce(boundary, radiusScale, padding) {
    let nodes;
    function force() {
        for (let i = 0; i < nodes.length; i++) {
            const d = nodes[i];
            const r = radiusScale(d.total_streams);

            if (d.song_type === "Solo") {
                // solo songs must stay above the boundary
                if (d.y > boundary - r - padding) d.y = boundary - r - padding;
            } else {
                // collaboration songs must stay below the boundary
                if (d.y < boundary + r + padding) d.y = boundary + r + padding;
            }
        }
    }
    force.initialize = function (_nodes) {
        nodes = _nodes;
    };
    return force;
}

window.BubbleChart = BubbleChart;
