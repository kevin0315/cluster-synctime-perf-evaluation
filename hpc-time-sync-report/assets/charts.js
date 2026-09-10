// Initialize Mermaid
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    securityLevel: 'loose',
    themeVariables: {
      primaryColor: '#e8f0f7',
      primaryTextColor: '#1a2332',
      primaryBorderColor: '#1b5e9e',
      lineColor: '#5a6b80',
      secondaryColor: '#f6f7fa',
      tertiaryColor: '#ffffff',
      fontFamily: 'WorkSans, sans-serif',
      fontSize: '13px'
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      rankSpacing: 50,
      nodeSpacing: 30
    }
  });
}

(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var accent3 = style.getPropertyValue('--accent3').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var intel = style.getPropertyValue('--intel').trim();
  var amd = style.getPropertyValue('--amd').trim();

  // Color mapping for sync schemes:
  //   外网 NTP (external/baseline) → accent2 (red)
  //   本地 NTP (local server)      → accent  (blue)
  //   直连 NTP (direct connection) → accent3 (green)
  //   本地 PTP (local PTP server)  → #8e44ad (purple)
  //   直连 PTP (direct PTP)        → #9b59b6 (light purple)
  // Cluster colors: Intel = intel (blue), AMD = amd (red)
  var ptpLocal = '#8e44ad';
  var ptpDirect = '#9b59b6';

  function baseGrid() {
    return { left: '8%', right: '5%', top: '18%', bottom: '12%' };
  }

  function baseLegend() {
    return {
      top: 5,
      textStyle: { color: muted, fontSize: 12 },
      itemWidth: 14,
      itemHeight: 8
    };
  }

  function baseAxis(splitLine) {
    return {
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: splitLine ? { lineStyle: { color: rule, type: 'dashed' } } : { show: false }
    };
  }

  function baseTooltip() {
    return {
      trigger: 'axis',
      appendToBody: true,
      backgroundColor: 'rgba(26,35,50,0.92)',
      borderColor: accent,
      borderWidth: 1,
      textStyle: { color: '#d4dce8', fontSize: 12 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(27,94,158,0.08)' } }
    };
  }

  // ============================================================
  // Chart 1: Clock Offset Comparison (both clusters, log y-axis)
  //   Intel:  外网NTP=53.3, 本地NTP=0.102
  //   AMD:    外网NTP=116.4, 本地NTP=0.223, 直连NTP=0.043
  //          本地PTP=0.0002, 直连PTP=0.00005
  // ============================================================
  var el1 = document.getElementById('chart-accuracy-comparison');
  if (el1) {
    var chart1 = echarts.init(el1, null, { renderer: 'svg' });
    chart1.setOption({
      tooltip: Object.assign(baseTooltip(), {
        formatter: function(params) {
          var s = params[0].name + '<br/>';
          params.forEach(function(p) {
            if (p.value !== '-' && p.value != null) {
              s += p.marker + p.seriesName + ': ' + p.value + ' µs<br/>';
            }
          });
          return s;
        }
      }),
      legend: Object.assign(baseLegend(), {
        data: ['外网 NTP', '本地 NTP', '直连 NTP', '本地 PTP', '直连 PTP'],
        top: 0,
        textStyle: { color: muted, fontSize: 10 },
        itemWidth: 11,
        itemHeight: 6
      }),
      grid: Object.assign(baseGrid(), { top: '22%' }),
      xAxis: Object.assign(baseAxis(false), {
        type: 'category',
        data: ['Intel 集群', 'AMD 集群'],
        name: '集群',
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: { color: ink, fontSize: 12, fontWeight: 600 }
      }),
      yAxis: Object.assign(baseAxis(true), {
        type: 'log',
        name: '平均时钟偏移 (µs)',
        nameTextStyle: { color: muted, fontSize: 11 },
        nameGap: 15,
        min: 0.00001,
        max: 200
      }),
      series: [
        {
          name: '外网 NTP', type: 'bar',
          data: [53.3, 116.4],
          itemStyle: { color: accent2, borderRadius: [3, 3, 0, 0] },
          barGap: '10%',
          label: {
            show: true, position: 'top',
            color: accent2, fontSize: 10, fontWeight: 700,
            formatter: '{c} µs'
          }
        },
        {
          name: '本地 NTP', type: 'bar',
          data: [0.102, 0.223],
          itemStyle: { color: accent, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: accent, fontSize: 10, fontWeight: 700,
            formatter: function(p) {
              var multiples = ['522×', '522×'];
              return p.value + ' µs\n(' + multiples[p.dataIndex] + ')';
            }
          }
        },
        {
          name: '直连 NTP', type: 'bar',
          data: ['-', 0.043],
          itemStyle: { color: accent3, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: accent3, fontSize: 10, fontWeight: 700,
            formatter: function(p) {
              if (p.value === '-' || p.value == null) return '';
              return p.value + ' µs\n(2,707×)';
            }
          }
        },
        {
          name: '本地 PTP', type: 'bar',
          data: ['-', 0.0002],
          itemStyle: { color: ptpLocal, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: ptpLocal, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.value === '-' || p.value == null) return '';
              return '0.2 ns';
            }
          }
        },
        {
          name: '直连 PTP', type: 'bar',
          data: ['-', 0.00005],
          itemStyle: { color: ptpDirect, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: ptpDirect, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.value === '-' || p.value == null) return '';
              return '<0.1 ns';
            }
          }
        }
      ]
    });
    window.addEventListener('resize', function() { chart1.resize(); });
  }

  // ============================================================
  // Chart 2: HPL Performance Comparison (dual Y-axes, 1/2/4 nodes)
  //   Intel 外网NTP: 402.1, 801.3, 1491.3
  //   Intel 本地NTP: 427.2, 849.9, 1590.4
  //   AMD   外网NTP: 5568.6, 6338.1, 5902.9
  //   AMD   本地NTP: 5568.2, 6347.9, 6193.7
  //   AMD   直连NTP: 5558.6, 6267.0, 7157.9
  // ============================================================
  var el2 = document.getElementById('chart-hpl-performance');
  if (el2) {
    var chart2 = echarts.init(el2, null, { renderer: 'svg' });
    chart2.setOption({
      tooltip: Object.assign(baseTooltip(), {
        formatter: function(params) {
          var s = params[0].name + '<br/>';
          params.forEach(function(p) {
            if (p.value != null && p.value !== '-') {
              s += p.marker + p.seriesName + ': ' + p.value + ' GFLOPS<br/>';
            }
          });
          return s;
        }
      }),
      legend: Object.assign(baseLegend(), {
        data: [
          'Intel-外网NTP', 'Intel-本地NTP',
          'AMD-外网NTP', 'AMD-本地NTP', 'AMD-直连NTP',
          'AMD-本地PTP', 'AMD-直连PTP'
        ],
        top: 0,
        textStyle: { color: muted, fontSize: 9 },
        itemWidth: 10,
        itemHeight: 6
      }),
      grid: Object.assign(baseGrid(), { top: '22%', left: '9%', right: '9%' }),
      xAxis: Object.assign(baseAxis(false), {
        type: 'category',
        data: ['1 节点', '2 节点', '4 节点'],
        name: '集群规模',
        nameLocation: 'middle',
        nameGap: 28
      }),
      yAxis: [
        Object.assign(baseAxis(true), {
          type: 'value',
          name: 'Intel HPL (GFLOPS)',
          nameTextStyle: { color: intel, fontSize: 11 },
          nameGap: 15,
          max: 1800,
          splitLine: { lineStyle: { color: rule, type: 'dashed' } }
        }),
        Object.assign(baseAxis(false), {
          type: 'value',
          name: 'AMD HPL (GFLOPS)',
          nameTextStyle: { color: amd, fontSize: 11 },
          nameGap: 15,
          max: 8000,
          splitLine: { show: false }
        })
      ],
      series: [
        {
          name: 'Intel-外网NTP', type: 'bar', yAxisIndex: 0,
          data: [402.1, 801.3, 1491.3],
          itemStyle: { color: accent2, borderRadius: [2, 2, 0, 0], opacity: 0.65 },
          barGap: '5%'
        },
        {
          name: 'Intel-本地NTP', type: 'bar', yAxisIndex: 0,
          data: [427.2, 849.9, 1590.4],
          itemStyle: { color: accent, borderRadius: [2, 2, 0, 0] },
          label: {
            show: true, position: 'top',
            color: accent, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.dataIndex !== 2) return '';
              var imp = (p.value - 1491.3) / 1491.3 * 100;
              return '+' + imp.toFixed(1) + '%';
            }
          }
        },
        {
          name: 'AMD-外网NTP', type: 'bar', yAxisIndex: 1,
          data: [5568.6, 6338.1, 5902.9],
          itemStyle: { color: accent2, borderRadius: [2, 2, 0, 0], opacity: 0.35 },
          barGap: '5%'
        },
        {
          name: 'AMD-本地NTP', type: 'bar', yAxisIndex: 1,
          data: [5568.2, 6347.9, 6193.7],
          itemStyle: { color: accent, borderRadius: [2, 2, 0, 0], opacity: 0.6 },
          label: {
            show: true, position: 'top',
            color: accent, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.dataIndex !== 2) return '';
              var imp = (p.value - 5902.9) / 5902.9 * 100;
              return '+' + imp.toFixed(1) + '%';
            }
          }
        },
        {
          name: 'AMD-直连NTP', type: 'bar', yAxisIndex: 1,
          data: [5558.6, 6267.0, 7157.9],
          itemStyle: { color: accent3, borderRadius: [2, 2, 0, 0] },
          label: {
            show: true, position: 'top',
            color: accent3, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.dataIndex !== 2) return '';
              var imp = (p.value - 5902.9) / 5902.9 * 100;
              return '+' + imp.toFixed(1) + '%';
            }
          }
        },
        {
          name: 'AMD-本地PTP', type: 'bar', yAxisIndex: 1,
          data: [5553.2, 6375.4, 3001.0],
          itemStyle: { color: ptpLocal, borderRadius: [2, 2, 0, 0], opacity: 0.7 },
          label: {
            show: true, position: 'top',
            color: ptpLocal, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.dataIndex !== 2) return '';
              var imp = (p.value - 5902.9) / 5902.9 * 100;
              return imp.toFixed(1) + '%';
            }
          }
        },
        {
          name: 'AMD-直连PTP', type: 'bar', yAxisIndex: 1,
          data: [5552.2, 6338.0, 4477.3],
          itemStyle: { color: ptpDirect, borderRadius: [2, 2, 0, 0], opacity: 0.7 },
          label: {
            show: true, position: 'top',
            color: ptpDirect, fontSize: 9, fontWeight: 700,
            formatter: function(p) {
              if (p.dataIndex !== 2) return '';
              var imp = (p.value - 5902.9) / 5902.9 * 100;
              return imp.toFixed(1) + '%';
            }
          }
        }
      ]
    });
    window.addEventListener('resize', function() { chart2.resize(); });
  }

  // ============================================================
  // Chart 3: CV Improvement (4-node HPL, both clusters)
  //   Intel: 外网NTP=3.7%, 本地NTP=0.3%
  //   AMD:   外网NTP=11.9%, 本地NTP=10.5%, 直连NTP=4.0%
  //          本地PTP=18.6%, 直连PTP=10.8%
  // ============================================================
  var el3 = document.getElementById('chart-cv-improvement');
  if (el3) {
    var chart3 = echarts.init(el3, null, { renderer: 'svg' });
    chart3.setOption({
      tooltip: Object.assign(baseTooltip(), {
        formatter: function(params) {
          var s = params[0].name + '<br/>';
          params.forEach(function(p) {
            if (p.value !== '-' && p.value != null) {
              s += p.marker + p.seriesName + ': ' + p.value + '%<br/>';
            }
          });
          return s;
        }
      }),
      legend: Object.assign(baseLegend(), {
        data: ['外网 NTP', '本地 NTP', '直连 NTP', '本地 PTP', '直连 PTP'],
        top: 0,
        textStyle: { color: muted, fontSize: 10 },
        itemWidth: 11,
        itemHeight: 6
      }),
      grid: Object.assign(baseGrid(), { top: '22%' }),
      xAxis: Object.assign(baseAxis(false), {
        type: 'category',
        data: ['Intel 集群', 'AMD 集群'],
        name: '集群',
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: { color: ink, fontSize: 12, fontWeight: 600 }
      }),
      yAxis: Object.assign(baseAxis(true), {
        type: 'value',
        name: '变异系数 (%)',
        nameTextStyle: { color: muted, fontSize: 11 },
        nameGap: 15,
        max: 22
      }),
      series: [
        {
          name: '外网 NTP', type: 'bar',
          data: [3.7, 11.9],
          itemStyle: { color: accent2, borderRadius: [3, 3, 0, 0] },
          barGap: '10%',
          label: {
            show: true, position: 'top',
            color: accent2, fontSize: 10, fontWeight: 700,
            formatter: '{c}%'
          }
        },
        {
          name: '本地 NTP', type: 'bar',
          data: [0.3, 10.5],
          itemStyle: { color: accent, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: accent, fontSize: 10, fontWeight: 700,
            formatter: '{c}%'
          }
        },
        {
          name: '直连 NTP', type: 'bar',
          data: ['-', 4.0],
          itemStyle: { color: accent3, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: accent3, fontSize: 10, fontWeight: 700,
            formatter: function(p) {
              if (p.value === '-' || p.value == null) return '';
              return p.value + '%';
            }
          }
        },
        {
          name: '本地 PTP', type: 'bar',
          data: ['-', 18.6],
          itemStyle: { color: ptpLocal, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: ptpLocal, fontSize: 10, fontWeight: 700,
            formatter: function(p) {
              if (p.value === '-' || p.value == null) return '';
              return p.value + '%';
            }
          }
        },
        {
          name: '直连 PTP', type: 'bar',
          data: ['-', 10.8],
          itemStyle: { color: ptpDirect, borderRadius: [3, 3, 0, 0] },
          label: {
            show: true, position: 'top',
            color: ptpDirect, fontSize: 10, fontWeight: 700,
            formatter: function(p) {
              if (p.value === '-' || p.value == null) return '';
              return p.value + '%';
            }
          }
        }
      ]
    });
    window.addEventListener('resize', function() { chart3.resize(); });
  }

  // ============================================================
  // Chart 4: Offset vs Performance Correlation (scatter, log x-axis)
  //   Intel 外网NTP: (53.3, 0%)     Intel 本地NTP: (0.102, 6.6%)
  //   AMD   外网NTP: (116.4, 0%)    AMD   本地NTP: (0.223, 4.9%)
  //   AMD   直连NTP: (0.043, 21.3%) AMD   本地PTP: (0.0002, -49.2%)
  //   AMD   直连PTP: (0.00005, -24.1%)
  // ============================================================
  var el4 = document.getElementById('chart-correlation');
  if (el4) {
    var chart4 = echarts.init(el4, null, { renderer: 'svg' });
    chart4.setOption({
      tooltip: Object.assign(baseTooltip(), {
        trigger: 'item',
        axisPointer: { type: 'cross', crossStyle: { color: rule } },
        formatter: function(p) {
          var perf = p.data.value[1];
          var sign = perf >= 0 ? '+' : '';
          return p.data.name + '<br/>' +
                 '时钟偏移: ' + p.data.value[0] + ' µs<br/>' +
                 '性能提升: ' + sign + perf + '%';
        }
      }),
      legend: Object.assign(baseLegend(), {
        data: ['Intel 集群 (NTP)', 'AMD 集群 (NTP)', 'AMD 集群 (PTP)'],
        top: 0,
        textStyle: { color: muted, fontSize: 10 },
        itemWidth: 11,
        itemHeight: 6
      }),
      grid: Object.assign(baseGrid(), { top: '22%', left: '10%', right: '14%' }),
      xAxis: Object.assign(baseAxis(true), {
        type: 'log',
        name: '平均时钟偏移 (µs)',
        nameTextStyle: { color: muted, fontSize: 11 },
        nameLocation: 'middle',
        nameGap: 28,
        min: 0.00001,
        max: 200
      }),
      yAxis: Object.assign(baseAxis(true), {
        type: 'value',
        name: 'HPL 性能提升 (%)',
        nameTextStyle: { color: muted, fontSize: 11 },
        nameGap: 15,
        min: -60,
        max: 25
      }),
      series: [
        {
          name: 'Intel 集群 (NTP)', type: 'scatter',
          data: [
            { name: 'Intel-外网NTP', value: [53.3, 0] },
            { name: 'Intel-本地NTP', value: [0.102, 6.6] }
          ],
          symbolSize: 16,
          itemStyle: { color: intel, borderColor: '#ffffff', borderWidth: 2 },
          label: {
            show: true, position: 'right',
            color: ink, fontSize: 10, fontWeight: 600,
            formatter: function(p) {
              return p.data.name.split('-')[1] + '\n(+' + p.data.value[1] + '%)';
            }
          }
        },
        {
          name: 'AMD 集群 (NTP)', type: 'scatter',
          data: [
            { name: 'AMD-外网NTP', value: [116.4, 0] },
            { name: 'AMD-本地NTP', value: [0.223, 4.9] },
            { name: 'AMD-直连NTP', value: [0.043, 21.3] }
          ],
          symbolSize: 16,
          itemStyle: { color: amd, borderColor: '#ffffff', borderWidth: 2 },
          label: {
            show: true, position: 'right',
            color: ink, fontSize: 10, fontWeight: 600,
            formatter: function(p) {
              var sign = p.data.value[1] >= 0 ? '+' : '';
              return p.data.name.split('-')[1] + '\n(' + sign + p.data.value[1] + '%)';
            }
          }
        },
        {
          name: 'AMD 集群 (PTP)', type: 'scatter',
          data: [
            { name: 'AMD-本地PTP', value: [0.0002, -49.2] },
            { name: 'AMD-直连PTP', value: [0.00005, -24.1] }
          ],
          symbolSize: 16,
          itemStyle: { color: ptpLocal, borderColor: '#ffffff', borderWidth: 2 },
          label: {
            show: true, position: 'left',
            color: ptpLocal, fontSize: 10, fontWeight: 600,
            formatter: function(p) {
              return p.data.name.split('-')[1] + '\n(' + p.data.value[1] + '%)';
            }
          }
        }
      ]
    });
    window.addEventListener('resize', function() { chart4.resize(); });
  }
})();
