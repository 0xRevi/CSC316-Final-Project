class BarChart {
    constructor(config) {
        this.dataPath = config.dataPath;
        this.container = config.container;
        this.width = config.width;
        this.height = config.height;
        this.margin = config.margin || { top: 20, right: 20, bottom: 60, left: 60 };
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
    }

    async loadData() {
        let raw = await d3.csv(this.dataPath);
        // Exclude rows where parent_genres is nan
        raw = raw.filter(d => d.parent_genres && d.parent_genres.toLowerCase() !== "nan");
        return raw;
    }

    processData(data) {
        // Trim years_on_chart
        data.forEach(d => {
            d.years_on_chart = d.years_on_chart.trim();
        });

        // Group by year
        const nested = d3.group(
            data,
            d => d.years_on_chart,
            d => d.parent_genres
        );

        // For each year, produce an array of up to 10 items:
        // { year, parent_genres, total, soloCount, collabCount, soloProp, collabProp }
        const final = [];
        for (const [year, genreMap] of nested.entries()) {
            const tempArr = [];
            for (const [genre, rows] of genreMap.entries()) {
                const soloCount = rows.filter(r => r.song_type === "Solo").length;
                const collabCount = rows.filter(r => r.song_type === "Collaboration").length;
                const total = soloCount + collabCount;
                if (total > 0) {
                    tempArr.push({
                        year,
                        parent_genres: genre,
                        total,
                        soloCount,
                        collabCount,
                        soloProp: soloCount / total,
                        collabProp: collabCount / total
                    });
                }
            }
            // Sort by total descending, pick top 10
            tempArr.sort((a, b) => d3.descending(a.total, b.total));
            const top10 = tempArr.slice(0, 10);
            final.push({ year, data: top10 });
        }
        // Sort years in ascending order
        final.sort((a, b) => d3.ascending(+a.year, +b.year));
        return final;
    }

    render() {
        this.loadData().then(rawData => {
            const nested = this.processData(rawData);

            // Flatten all genres across all years to define a color scale domain
            const allGenres = new Set();
            nested.forEach(yearObj => {
                yearObj.data.forEach(item => {
                    allGenres.add(item.parent_genres);
                });
            });
            const genreArray = Array.from(allGenres);

            // Color scale for genres
            const colorScale = d3.scaleOrdinal()
                .domain(genreArray)
                .range(d3.schemeCategory10.concat(d3.schemeSet3, d3.schemeDark2));

            // Extract all years
            const allYears = nested.map(d => d.year);

            // x0 scale for year
            const x0 = d3.scaleBand()
                .domain(allYears)
                .range([0, this.innerWidth])
                .paddingInner(0.2);

            // yScale for proportion
            const yScale = d3.scaleLinear()
                .domain([0, 1])
                .range([this.innerHeight, 0]);

            // Create SVG
            const svg = d3.select(this.container)
                .append("svg")
                .attr("width", this.width)
                .attr("height", this.height);

            const chartArea = svg.append("g")
                .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

            // Add x-axis labeled Year
            const xAxis = d3.axisBottom(x0);
            chartArea.append("g")
                .attr("class", "x-axis")
                .attr("transform", `translate(0, ${this.innerHeight})`)
                .call(xAxis)
                .append("text")
                .attr("x", this.innerWidth / 2)
                .attr("y", 40)
                .attr("fill", "#000")
                .attr("text-anchor", "middle")
                .attr("font-weight", "bold")
                .text("Year");

            // Add y-axis
            const yAxis = d3.axisLeft(yScale).tickFormat(d3.format(".0%"));
            chartArea.append("g")
                .attr("class", "y-axis")
                .call(yAxis);

            // For each year, create a group
            const yearGroup = chartArea.selectAll(".yearGroup")
                .data(nested)
                .join("g")
                .attr("class", "yearGroup")
                .attr("transform", d => `translate(${x0(d.year)}, 0)`);

            // For each year group, define a sub-scale for up to 10 genres
            yearGroup.each(function(d) {
                const groupData = d.data; // up to 10 items
                const x1 = d3.scaleBand()
                    .domain(groupData.map(g => g.parent_genres))
                    .range([0, x0.bandwidth()])
                    .padding(0.1);

                const gSelection = d3.select(this).selectAll(".genreStack")
                    .data(groupData)
                    .join("g")
                    .attr("class", "genreStack")
                    .attr("transform", item => `translate(${x1(item.parent_genres)}, 0)`);

                // For each genre, create a stacked bar
                gSelection.each(function(item) {
                    const baseColor = colorScale(item.parent_genres);

                    // Solo portion
                    const soloY1 = yScale(item.soloProp);
                    const soloHeight = yScale(0) - soloY1;

                    d3.select(this)
                        .append("rect")
                        .attr("class", "soloRect")
                        .attr("x", 0)
                        .attr("width", x1.bandwidth())
                        .attr("y", soloY1)
                        .attr("height", soloHeight)
                        .attr("fill", baseColor)
                        .on("mouseover", (event) => {
                            const pct = (item.soloProp * 100).toFixed(1);
                            d3.select("#tooltip")
                                .style("opacity", 1)
                                .html(`<strong>Year: ${item.year}</strong><br/>
                                       Genre: ${item.parent_genres}<br/>
                                       Solo: ${pct}%`);
                        })
                        .on("mousemove", (event) => {
                            d3.select("#tooltip")
                                .style("left", event.pageX + 10 + "px")
                                .style("top", event.pageY + 10 + "px");
                        })
                        .on("mouseout", () => {
                            d3.select("#tooltip").style("opacity", 0);
                        });

                    // Collaboration portion is stacked on top of Solo
                    const collabY0 = item.soloProp;
                    const collabY1 = item.soloProp + item.collabProp;
                    const collabPixelBottom = yScale(collabY0);
                    const collabPixelTop = yScale(collabY1);
                    const collabHeight = collabPixelBottom - collabPixelTop;

                    let collabColor = d3.color(baseColor);
                    if (collabColor) {
                        collabColor = collabColor.darker(0.5);
                    } else {
                        collabColor = baseColor;
                    }

                    d3.select(this)
                        .append("rect")
                        .attr("class", "collabRect")
                        .attr("x", 0)
                        .attr("width", x1.bandwidth())
                        .attr("y", collabPixelTop)
                        .attr("height", collabHeight)
                        .attr("fill", collabColor)
                        .on("mouseover", (event) => {
                            const pct = (item.collabProp * 100).toFixed(1);
                            d3.select("#tooltip")
                                .style("opacity", 1)
                                .html(`<strong>Year: ${item.year}</strong><br/>
                                       Genre: ${item.parent_genres}<br/>
                                       Collaboration: ${pct}%`);
                        })
                        .on("mousemove", (event) => {
                            d3.select("#tooltip")
                                .style("left", event.pageX + 10 + "px")
                                .style("top", event.pageY + 10 + "px");
                        })
                        .on("mouseout", () => {
                            d3.select("#tooltip").style("opacity", 0);
                        });
                });
            });

            // Add legend on the right side of the chart
            this.addLegend(svg, colorScale, genreArray);
        });
    }

    // Add legend on the right side of the chart
    addLegend(svg, colorScale, genres) {
        // Position legend to the right of the chart area:
        const legendX = this.margin.left + this.innerWidth + 200;
        // Position legend at top margin
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${legendX}, ${this.margin.top})`);

        genres.forEach((genre, i) => {
            const g = legend.append("g")
                .attr("transform", `translate(0, ${i * 20})`);

            g.append("rect")
                .attr("x", 0)
                .attr("y", -8)
                .attr("width", 16)
                .attr("height", 16)
                .attr("fill", colorScale(genre));

            g.append("text")
                .text(genre)
                .attr("x", 20)
                .attr("y", 5)
                .style("font-size", "12px")
                .style("fill", "#333");
        });
    }
}

window.BarChart = BarChart;
