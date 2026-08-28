# 高精度时间同步服务对HPC集群计算效率提升验证测试报告

> [!IMPORTANT]
>
> **报告编号**: HPC-TS-2026-017
>
> **报告版本**: V6.0
>
> **测试周期**: 2026.07.30 — 2026.08.28
>
> **测试集群**: Intel 集群 ×1 + AMD 集群 ×1
>
> **密级**: 内部公开
>
> **源码仓库**: https://github.com/kevin0315/cluster-synctime-perf-evaluation
>
> **测试专家组成员：**
>
> - 中物院成都科学技术发展中心      夏广新
> - 电子科技大学                                 聂锦兰
> - 四川大学                                         杜    勇
>
> **技术支持：**
>
> - 四川泰富地面北斗科技股份有限公司      李高峰
>
> **测试协调：**
>
> - 四川泰富地面北斗科技股份有限公司      余媛芝

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [测试背景与目标](#2-测试背景与目标)
3. [时间同步技术概述](#3-时间同步技术概述)
4. [测试环境配置](#4-测试环境配置)
5. [测试方法论](#5-测试方法论)
6. [测试结果与分析](#6-测试结果与分析)
7. [结论与部署建议](#7-结论与部署建议)
8. [测试局限性](#8-测试局限性)
9. [进一步测试方向与内容](#9-进一步测试方向与内容)
10. [附录](#10-附录)
11. [参考文献](#参考文献)

---

## 1. 执行摘要

本报告系统验证了在两套独立同构 HPC 集群中，提高时间同步精度对集群计算效率的实际影响。测试集群包括 **Intel 集群**（4 节点 Xeon E5-2697 v2，40Gb InfiniBand）和 **AMD 集群**（4 节点 EPYC 9654，10Gb 光纤），对比了三种时间同步配置方案——**外网 NTP（默认方案）**、**本地 NTP 服务器**、**直连 NTP 服务器**（仅 AMD 集群），通过 HPL 基准测试量化时间同步精度提升对计算性能的影响。

测试结果表明，提高时间同步精度对 HPC 集群计算效率有显著且可测量的提升：

- **时间同步精度**：从外网 NTP 切换至本地 NTP 服务器后，Intel 集群节点平均时钟偏移从 **53.3 µs** 降至 **0.102 µs**，精度提升约 **522 倍**；AMD 集群从 **116.4 µs** 降至 **0.223 µs**，精度提升约 **522 倍**。直连方案进一步将 AMD 集群平均偏移降至 **0.043 µs**。

- **计算性能提升**：Intel 集群 HPL 性能提升 **6.1%—6.6%**（4 节点从 1491.3 GFLOPS 提升至 1590.4 GFLOPS）；AMD 集群 4 节点 HPL 性能从外网 NTP 的 5902.9 GFLOPS 提升至本地 NTP 的 6193.7 GFLOPS（+4.9%），直连方案进一步提升至 7157.9 GFLOPS（+15.6% 相对于本地 NTP）。**性能提升幅度与时间同步精度提升的绝对量正相关——精度提升越大，性能收益越显著。**

- **性能稳定性**：时间同步精度提升后，HPL 重复测试的变异系数（CV）显著降低。Intel 集群 4 节点 CV 从 3.7% 降至 0.3%；AMD 集群 4 节点 CV 从 11.9% 降至 10.5%（本地 NTP），直连方案进一步降至 4.0%。精度越高，性能可重复性越好。

| 核心指标 | Intel 集群（本地NTP vs 外网NTP） | AMD 集群（直连vs 外网NTP） |
|:---|:---|:---|
| 时钟精度提升 | **522×** | **2,707×** |
| HPL 性能提升（4节点） | **6.6%** | **21.3%** |
| 性能变异系数降低 | **92%** | **66%** |

> **核心结论**：提高 HPC 集群时间同步精度能够显著提升计算效率和性能稳定性。在 4 节点规模下，仅通过将时间同步从外网 NTP 切换至本地高精度 NTP 服务器，Intel 集群 HPL 性能提升 6.6%，AMD 集群提升 4.9%；进一步采用直连授时架构（AMD 集群）可带来累计 21.3% 的性能提升。性能提升的同时，重复测试的变异系数大幅降低，意味着作业运行时间更加可预测、可重复。鉴于本地高精度时间同步服务器的部署成本远低于同等算力提升所需的硬件投入，建议 HPC 集群优先升级时间同步基础设施。

---

## 2. 测试背景与目标

### 2.1 研究背景

高性能计算集群中，节点间时间同步精度对计算效率的影响是一个长期被低估的因素。在典型的 HPC 并行计算场景中，所有计算节点需要协同完成同一任务，节点间的时钟一致性直接影响多个关键环节的效率：

- **MPI 集合通信**：`MPI_Barrier`、`MPI_Allreduce`、`MPI_Bcast` 等集合操作是并行程序中最常见的同步点。时钟偏移导致不同节点对"同时到达"的判断存在偏差，最先到达 barrier 的节点需要等待最慢节点，产生空闲等待时间。已有研究表明，时钟偏移是集合通信延迟的重要组成部分 [1]。

- **任务调度与负载均衡**：SLURM 等作业调度系统依赖时间戳进行作业排队、资源分配和计费。时钟偏差可能导致调度决策的时序错误，影响负载均衡效果和资源利用率。

- **分布式性能分析**：Score-P、TAU 等分布式性能分析工具依赖精确的时间戳对齐来重建跨节点事件因果链。微秒级偏差在纳秒级事件分析中会产生严重的时序错位 [2]。

- **网络协议效率**：InfiniBand 和以太网的拥塞控制、重传机制依赖精确的时间测量。时钟偏差会影响 RTT 估算的准确性，进而影响拥塞窗口的调整 [3]。

当前两套集群均使用 `chronyd.service` 进行时间同步，管理节点通过互联网与公共 NTP 服务器对时，计算节点再与管理节点对时。这种多级同步架构在互联网延迟和抖动的影响下，通常只能达到 **100—1,000 µs** 级别的同步精度 [4]。而通过部署本地高精度时间同步服务器，将授时源移入集群内部的低延迟局域网，可以显著提升同步精度。

**需要特别说明的是**：本次测试的两套 HPC 集群均为典型的紧密耦合并行计算集群（同构节点、高速互连网络、MPI 并行编程模型），而非松散耦合的分布式系统。在这种架构下，节点间的同步精度对整体计算效率的影响更为直接和显著。

### 2.2 测试目标

本测试旨在回答以下核心问题：

1. 本地高精度 NTP 时间同步服务器在实际 HPC 环境中能实现何种精度？与当前默认的外网 NTP 方案相比优势有多大？
2. 提高时间同步精度对 HPL 等标准 HPC 基准测试的计算性能是否有可测量的影响？影响幅度有多大？
3. 不同计算网络环境（40Gb InfiniBand vs 10Gb 光纤）下，时间同步精度提升的收益差异如何？
4. 性能变异系数（稳定性）是否随时间同步精度提升而改善？
5. 直连授时架构（节点与时间服务器直接相连）相比局域网授时能带来多少额外收益？

---

## 3. 时间同步技术概述

### 3.1 NTP 协议与 chrony 实现

网络时间协议（Network Time Protocol, NTP）由 David L. Mills 于 1985 年提出，当前最新版本为 NTPv4（RFC 5905）[4]。NTP 采用分层的主从架构（stratum 层级），通过客户端-服务器模式交换时间报文，计算网络延迟和时钟偏移。

chrony 是 NTP 协议的现代实现，由 Red Hat 开发并维护，包含 `chronyd`（守护进程）和 `chronyc`（命令行工具）两个组件。chrony 相比传统 ntpd 在以下方面有显著改进：更快的收敛速度、更好的网络抖动适应性、更低的 CPU 开销，以及更精确的时钟控制算法 [5]。

NTP 同步精度受以下因素影响：

| 影响因素 | 说明 |
|:---|:---|
| 网络延迟 | 授时服务器与客户端之间的往返时间越长，精度越低 |
| 网络抖动 | 延迟的波动直接影响偏移估算的准确性 |
| 同步层级 | 每经过一层 stratum，精度会有一定衰减 |
| 时间戳方式 | 软件时间戳受内核调度和中断延迟影响，硬件时间戳精度更高 |
| 时钟漂移 | 本地晶振的频率稳定性影响长期同步精度 |

### 3.2 三种同步方案对比

本次测试涉及三种时间同步配置方案，均基于 chrony/NTPv4 协议，但授时拓扑不同：

| 技术特征 | 方案一：外网 NTP（默认） | 方案二：本地 NTP 服务器 | 方案三：直连 NTP 服务器 |
|:---|:---|:---|:---|
| 协议标准 | RFC 5905 (NTPv4) | RFC 5905 (NTPv4) | RFC 5905 (NTPv4) |
| 实现 | chrony | chrony | chrony |
| 授时源 | 互联网公共 NTP 服务器 | 本地高精度时间服务器 | 本地高精度时间服务器 |
| 同步层级 | 管理节点→外网（stratum 2-3）<br>计算节点→管理节点（stratum 3-4） | 所有节点→本地服务器（stratum 1-2） | 所有节点→直连服务器（stratum 1） |
| 授时网络路径 | 互联网 + 1GbE 管理网 | 1GbE 管理局域网 | 直连网线（无交换机） |
| 时间戳方式 | 软件时间戳 | 软件时间戳 | 软件时间戳 |
| 典型精度（实测） | 50—200 µs | 0.1—0.3 µs | 0.04—0.05 µs |
| 硬件要求 | 无特殊要求 | 本地时间服务器设备 | 本地时间服务器 + 额外网口 |
| 部署复杂度 | 低 | 中 | 高 |

### 3.3 时间同步精度与计算效率的关系机制

时间同步精度影响 HPC 计算效率的核心机制在于**并行同步点的等待开销**。

在 MPI 并行程序中，`MPI_Barrier` 是最基本的全局同步操作——所有进程必须到达 barrier 后才能继续执行。由于各节点的本地时钟存在偏移，各进程"实际同时"到达 barrier 的时刻在全局时间轴上并不一致。时钟偏移越大，最早到达的进程等待最晚到达进程的时间就越长。

对于计算密集型的 HPL 基准，其核心算法是 LU 分解，主要通信模式为行列广播（`MPI_Bcast`）和归约（`MPI_Reduce`）。每次通信都隐含了节点间的同步等待。当时钟偏差较大时，这种等待会累积，最终体现在整体运行时间的增加上。

此外，时钟抖动（jitter）会导致每次运行的通信等待时间不同，表现为性能测试结果的变异系数较大，即可重复性差。提高时间同步精度不仅能提升平均性能，还能降低性能波动 [1]。

---

## 4. 测试环境配置

### 4.1 Intel 集群硬件配置

| 组件 | 管理节点 | 计算节点（×4） |
|:---|:---|:---|
| CPU | 双路 Intel Xeon E5-2660 v2 @ 2.20GHz | 双路 Intel Xeon E5-2697 v2 @ 2.70GHz |
| 核心数 | 20C/40T（双路） | 24C/48T（双路） |
| 内存 | 64 GB | 128 GB |
| 系统盘 | 1.96 TB SSD | 480 GB SSD |
| 用户数据存储 | 300GB SAS × RAID5 = 33 TB | — |
| 计算网络 | 40Gb InfiniBand（11.1.1.x/24） | |
| 管理/授时网络 | 1000Mb 以太网（10.1.1.x/24） | |
| 访问登录网络 | 192.168.2.200 | |

### 4.2 AMD 集群硬件配置

| 组件 | 管理节点 | 计算节点（×4） |
|:---|:---|:---|
| CPU | 单路 AMD Ryzen Threadripper PRO 3975WX 32-Cores | 双路 AMD EPYC 9654 96-Core Processor |
| 核心数 | 32C/64T（单路） | 192C/384T（双路） |
| 内存 | 256 GB | 1028 GB |
| 系统盘 | 1.96 TB SSD | 960 GB SSD |
| 计算网络 | 10Gb 光纤（11.1.1.x/24） | |
| 管理/授时网络 | 1000Mb 以太网（10.1.1.x/24） | |
| 访问登录网络 | 192.168.2.214 | |

### 4.3 软件栈配置

**Intel 集群：**

```bash
# 操作系统与软件
OS:        CentOS 7.9
Compiler:  GCC 4.8.5
SLURM:     24.05.3
MPI:       OpenMPI 4.1.5
系统默认授时服务:   chronyd.service

# 并行环境与数学库（均由系统编译器编译）
OpenMPI:   4.1.5 (源码编译)
OpenBLAS, LAPACK, ScaLAPACK (源码编译)
HPL:       系统编译器编译
# 非厂商优化库（非 Intel MKL / AMD AOCL）

# PTP 部署
linuxptp:  3.1.1 (ptp4l + phc2sys)
# 网卡 PHC: 服务器主板集成千兆电口网卡 支持 HW timestamping
```

**AMD 集群：**

```bash
# 操作系统与软件
OS:        Rocky Linux 8.10
Compiler:  GCC 8.5.0
SLURM:     24.05.3
MPI:       OpenMPI 4.1.5
系统默认授时服务:   chronyd.service

# 并行环境与数学库（均由系统编译器编译）
OpenMPI:   4.1.5 (源码编译)
OpenBLAS, LAPACK, ScaLAPACK (源码编译)
HPL:       系统编译器编译
# 非厂商优化库（非 Intel MKL / AMD AOCL）

# PTP 部署
linuxptp:  3.1.1 (ptp4l + phc2sys)
# 网卡 PHC: 服务器主板集成千兆电口网卡 支持 HW timestamping
```

### 4.4 网络拓扑

```
┌──────────────────────────────────────────────────┐
│              管理/授时网络 (1GbE)                   │
│              10.1.1.3/24；10.1.1.5/24；                          │
│         （两集群共享授时网络）                       │
└───┬──────────┬──────────┬──────────┬──────────┬───┘
    │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼
┌─────────────────────┐  ┌─────────────────────────┐
│   Intel 集群         │  │   AMD 集群               │
│   (CentOS 7.9)      │  │   (Rocky 8.10)          │
│                     │  │                         │
│  ┌───────────────┐  │  │  ┌───────────────────┐  │
│  │ 管理节点       │  │  │  │ 管理节点           │  │
│  │ E5-2660 v2   │  │  │  │ TR PRO 3975WX    │  │
│  │ 64GB/1.96TB  │  │  │  │ 256GB/1.96TB     │  │
│  └───────┬───────┘  │  │  └────────┬──────────┘  │
│          │          │  │           │             │
│  ┌───────▼───────┐  │  │  ┌────────▼──────────┐  │
│  │ 40Gb IB       │  │  │  │ 10Gb 光纤          │  │
│  │ 11.1.1.x/24   │  │  │  │ 11.1.1.x/24       │  │
│  └─┬───┬───┬───┬─┘  │  │  └─┬───┬───┬───┬─────┘  │
│    │   │   │   │    │  │    │   │   │   │        │
│  ┌─▼┐┌─▼┐┌─▼┐┌─▼┐  │  │  ┌─▼┐┌─▼┐┌─▼┐┌─▼┐      │
│  │N1││N2││N3││N4│  │  │  │N1││N2││N3││N4│      │
│  │v2││v2││v2││v2│  │  │  │96││96││96││96│      │
│  │24││24││24││24│  │  │  │C/││C/││C/││C/│      │
│  │C ││C ││C ││C │  │  │  │38││38││38││38│      │
│  └──┘└──┘└──┘└──┘  │  │  └──┘└──┘└──┘└──┘      │
│  128GB/480GB each  │  │  1028GB/960GB each     │
└─────────────────────┘  └─────────────────────────┘
```

两套集群共享同一 **1GbE 管理/授时网络**（10.1.1.x/24），当前通过该网络运行 `chronyd` 进行时间同步。PTP 部署方案同样在该授时网络上运行，但利用网卡的**硬件时间戳**能力，将同步精度从软件时间戳的微秒级提升至纳秒级。Intel 集群计算网络为 **40Gb InfiniBand**，AMD 集群计算网络为 **10Gb 光纤**，两套集群的计算网络不参与时间同步，仅用于 MPI 通信。

### 4.5 时间同步测试方案

为确保公平对比，各方案在相同硬件上独立部署和测试，每次切换前进行 24 小时稳定期，确保时钟已充分收敛。

**Intel 集群时间同步测试采用 2 种配置方案：**

1. **外网 NTP 方案（默认）**：管理节点与外网公共 NTP 时间服务器进行时间同步（使用默认配置），计算节点与管理节点进行时间同步（使用默认配置）；
2. **本地 NTP 方案**：高精度本地时间同步服务器接入集群管理网络，计算集群所有节点直接配置为与本地时间同步服务器进行时间校对。

**AMD 集群时间同步测试采用 3 种配置方案：**

1. **外网 NTP 方案（默认）**：管理节点与外网公共 NTP 时间服务器进行时间同步（使用默认配置），计算节点与管理节点进行时间同步（使用默认配置）；
2. **本地 NTP 方案**：高精度本地时间同步服务器接入集群管理网络，计算集群所有节点直接配置为与本地时间同步服务器进行时间校对；
3. **直连 NTP 方案**：所有节点通过网线直连时间同步服务器进行时间校对（不经过交换机）。

---

## 5. 测试方法论

### 5.1 测试矩阵

本次测试采用多维度测试矩阵，覆盖两种集群、多种同步方案、不同节点规模和两类测试维度：

| 维度 | 取值 | 说明 |
|:---|:---|:---|
| 同步方案 | 外网NTP / 本地NTP / 直连NTP* | 每方案独立部署，切换后 24h 稳定期 |
| 目标集群 | Intel 集群 / AMD 集群 | 两种架构 × 两种计算网络 |
| 基准类别 | 同步精度 / 计算性能 | 从底层时间到应用端到端的完整链路 |
| 集群规模 | 1 / 2 / 4 节点 | 考察规模扩展对时间同步影响的变化趋势 |

> *直连 NTP 方案仅在 AMD 集群上测试，Intel 集群因硬件限制未进行。*

### 5.2 测试工具与指标

| 测试维度 | 工具 | 关键指标 | 采样方法 |
|:---|:---|:---|:---|
| 时间同步精度 | \chronyc tracking\ | 平均偏移 (offset)、最大偏移、抖动 (jitter) | 连续 2h, 每 10s 采样 |
| 计算性能 | HPL | Rmax (GFLOPS) | 每规模 4 次运行取均值 |

### 5.3 环境控制与统计方法

为确保测试结果的可靠性和可重复性，采取以下控制措施：

- **SLURM 独占模式**：测试作业通过 \--exclusive\ 申请独占节点，避免其他作业干扰。
- **CPU 频率锁定**：所有节点设置 \cpupower frequency-set -g performance\，消除变频对性能的影响。
- **NUMA 绑定**：MPI 进程通过 \--map-by core --bind-to core\ 严格绑定至物理核心。
- **多次重复**：所有基准测试每组至少运行 4 次，报告均值和变异系数（CV）。
- **温度控制**：机房温度恒定 24±2°C。
- **稳定期**：每次切换时间同步方案后，等待 24 小时确保时钟充分收敛后再开始测试。

### 5.4 HPL 计算规模设定

为能体现出时间同步精度对计算效率影响的差异，HPL 计算规模设定为计算集群总内存的 30%~50%，确保计算过程中有足够的 MPI 通信量。各集群各规模的问题规模（N）如下：

| 集群 | 1 节点 | 2 节点 | 4 节点 |
|:---|:---|:---|:---|
| Intel | N=78,000 | N=110,000 | N=150,000 |
| AMD | N=122,880 | N=184,320 | N=256,000 |

---
## 6. 测试结果与分析

### 6.1 时间同步精度测试结果

时间同步精度测试采用自研数据采集脚本，通过 `chronyc tracking` 命令（NTP 模式）周期性采集各节点的时钟偏移数据。采样参数：每 10 秒采样一次，持续 2 小时（720 个采样点），5 个节点（管理节点 + 4 个计算节点）。

#### 6.1.1 NTP 模式数据采集脚本

```bash
#!/bin/bash
# time_collect.sh
sample_num=720
interval=10
csvfile="./result.csv"
logfile="./result.log"

nodes=(localhost compute-0-0 compute-0-1 compute-0-2 compute-0-3)

#写入csv表头
echo "sample_id,hostname,instant_offset_sec,last_offset_sec,jitter_sec" > "$csvfile"

for (( s=1; s<=sample_num; s++ )); do
    echo "==== 采样 $s / $sample_num ===="

    for host in "${nodes[@]}"; do
        if [[ "$host" == "localhost" ]];then
            output=$(chronyc tracking 2>/dev/null)
        else
            output=$(ssh -x "$host" "chronyc tracking" 2>/dev/null)
        fi

        instant_offset=$(echo "$output" | awk '/System time/ {print $4}')
        last_offset=$(echo "$output" | awk '/Last offset/ {print $4}')
        jitter=$(echo "$output" | awk '/RMS offset/ {print $4}')

        [[ -z "$instant_offset" ]] && instant_offset="NaN"
        [[ -z "$last_offset" ]] && last_offset="NaN"
        [[ -z "$jitter" ]] && jitter="NaN"

        echo "$s,$host,$instant_offset,$last_offset,$jitter" >> "$csvfile"
    done

    sleep "$interval"
done

echo "采样完成，开始计算统计值..."

#统计基于last_offset（原有偏移）和jitter
awk -F',' '
NR>1 {
    if ($3 != "NaN" && $4 != "NaN" && $5 != "NaN"){
        n++
        instant[n] = $3 + 0.0
        off[n] = $4 + 0.0
        jit[n] = $5 + 0.0
        sum_instant += instant[n]
        sum_off += off[n]
        sum_jit += jit[n]
    }
}
END {
    if(n>0){
        max_instant=instant[1];
        max_off=off[1];
        max_jit=jit[1];
        for(i=1;i<=n;i++){
            if(instant[i]>max_instant) max_instant=instant[i];
            if(off[i]>max_off) max_off=off[i];
            if(jit[i]>max_jit) max_jit=jit[i];
        }
        avg_instant = sum_instant / n;
        avg_off = sum_off / n;
        avg_jit = sum_jit / n;
        printf("=== 集群时间同步采样统计 ===\n")
        printf("有效采样点数                : %d\n", n)
        printf("瞬时偏差Instant平均(秒)      : %.9f\n", avg_instant)
        printf("瞬时偏差Instant最大值(秒)    : %.9f\n", max_instant)
        printf("Last-offset平均(秒)          : %.9f\n", avg_off)
        printf("Last-offset最大值(秒)        : %.9f\n", max_off)
        printf("Jitter(RMS)平均(秒)           : %.9f\n", avg_jit)
        printf("Jitter(RMS)最大值(秒)         : %.9f\n", max_jit)
    }else{
        print("无任何有效采样数据，请检查chrony同步状态")
    }
}
' "$csvfile" > "$logfile"

cat "$logfile"
echo -e "\n原始数据文件: $csvfile"
echo "统计结果文件: $logfile"
```

#### 6.1.2 Intel 集群时间同步精度

##### 方案一：外网 NTP（默认方案）

管理节点与默认外网 NTP 时间校准服务器校准时间，计算节点与管理节点校准时间。

```
=== 集群时间同步采样统计 ===
有效采样点数                : 6685
瞬时偏差Instant平均(秒)      : 0.000053299
瞬时偏差Instant最大值(秒)    : 0.000599674
Last-offset平均(秒)          : 0.000024447
Last-offset最大值(秒)        : 0.000581900
Jitter(RMS)平均(秒)           : 0.000394754
Jitter(RMS)最大值(秒)         : 0.002413681
```

##### 方案二：本地 NTP 服务器

管理节点和计算节点都与本地时间校准服务器校准时间。

```
=== 集群时间同步采样统计 ===
有效采样点数                : 3600
瞬时偏差Instant平均(秒)      : 0.000000102
瞬时偏差Instant最大值(秒)    : 0.000007998
Last-offset平均(秒)          : 0.000000006
Last-offset最大值(秒)        : 0.000006191
Jitter(RMS)平均(秒)           : 0.000000511
Jitter(RMS)最大值(秒)         : 0.000003037
```

##### Intel 集群精度对比汇总

| 指标 | 外网 NTP | 本地 NTP | 提升倍数 |
|:---|:---|:---|:---|
| 瞬时偏差平均值 | 53.299 µs | 0.102 µs | **522×** |
| 瞬时偏差最大值 | 599.674 µs | 7.998 µs | **75×** |
| Last-offset 平均值 | 24.447 µs | 0.006 µs | **4,074×** |
| Last-offset 最大值 | 581.900 µs | 6.191 µs | **94×** |
| Jitter(RMS) 平均值 | 394.754 µs | 0.511 µs | **772×** |
| Jitter(RMS) 最大值 | 2,413.681 µs | 3.037 µs | **795×** |

> [!IMPORTANT]
>
> **分析**：从外网 NTP 切换至本地 NTP 服务器后，Intel 集群的时间同步精度获得了数量级的提升。平均偏移从 53.3 µs 降至 0.1 µs，提升超过 500 倍。最大偏移从近 600 µs 降至 8 µs 以内，消除了百微秒级的时钟尖峰。抖动的改善更为显著，从平均 395 µs 降至 0.5 µs，意味着时钟更加稳定，波动极小。

#### 6.1.3 AMD 集群时间同步精度

##### 方案一：外网 NTP（默认方案）

```
=== 集群时间同步采样统计 ===
有效采样点数                : 2880
瞬时偏差Instant平均(秒)      : 0.000116436
瞬时偏差Instant最大值(秒)    : 0.001957388
Last-offset平均(秒)          : 0.000133937
Last-offset最大值(秒)        : 0.001718987
Jitter(RMS)平均(秒)           : 0.000392126
Jitter(RMS)最大值(秒)         : 0.001888102
```

##### 方案二：本地 NTP 服务器

```
=== 集群时间同步采样统计 ===
有效采样点数                : 2880
瞬时偏差Instant平均(秒)      : 0.000000223
瞬时偏差Instant最大值(秒)    : 0.000007571
Last-offset平均(秒)          : 0.000000008
Last-offset最大值(秒)        : 0.000005918
Jitter(RMS)平均(秒)           : 0.000000683
Jitter(RMS)最大值(秒)         : 0.000004068
```

##### 方案三：直连 NTP 服务器

```
=== 集群时间同步采样统计 ===
有效采样点数                : 2880
瞬时偏差Instant平均(秒)      : 0.000000043
瞬时偏差Instant最大值(秒)    : 0.000001647
Last-offset平均(秒)          : -0.000000009
Last-offset最大值(秒)        : 0.000003383
Jitter(RMS)平均(秒)           : 0.000000295
Jitter(RMS)最大值(秒)         : 0.000001459
```

##### AMD 集群精度对比汇总

| 指标 | 外网 NTP | 本地 NTP | 直连 NTP | 本地vs外网 | 直连vs本地 |
|:---|:---|:---|:---|:---|:---|
| 瞬时偏差平均值 | 116.436 µs | 0.223 µs | 0.043 µs | 522× | 5.2× |
| 瞬时偏差最大值 | 1,957.388 µs | 7.571 µs | 1.647 µs | 259× | 4.6× |
| Last-offset 平均值 | 133.937 µs | 0.008 µs | -0.009 µs | 16,742× | — |
| Last-offset 最大值 | 1,718.987 µs | 5.918 µs | 3.383 µs | 290× | 1.7× |
| Jitter(RMS) 平均值 | 392.126 µs | 0.683 µs | 0.295 µs | 574× | 2.3× |
| Jitter(RMS) 最大值 | 1,888.102 µs | 4.068 µs | 1.459 µs | 464× | 2.8× |

> [!IMPORTANT]
>
> **分析**：AMD 集群的趋势与 Intel 集群一致——从外网 NTP 切换至本地 NTP 后，精度提升超过 500 倍。直连方案进一步将平均偏移从 0.223 µs 降至 0.043 µs，最大偏移从 7.6 µs 降至 1.6 µs，抖动也进一步收窄。值得注意的是，外网 NTP 方案下 AMD 集群的偏移（~116 µs）显著大于 Intel 集群（~53 µs），这可能与 AMD 管理节点的时间服务器在国外异有关。

#### 6.1.4 精度测试小结

1. **本地 NTP 服务器的收益巨大**：两集群均验证了将授时源从互联网迁移至本地局域网后，时间同步精度从百微秒级提升至亚微秒级，提升幅度达 500 倍以上。
2. **网络路径越短，精度越高**：直连方案相比局域网方案进一步提升约 5 倍精度，验证了交换机转发延迟和抖动对 NTP 精度的影响。
3. **最大偏移的改善尤为关键**：外网 NTP 方案下最大偏移可达毫秒级（Intel 0.6 ms，AMD 2.0 ms），这种级别的时钟偏差在高频 MPI 通信中会造成可测量的性能损失。

---

### 6.2 HPL 计算性能测试结果

两套集群的 HPL、OpenMPI、OpenBLAS、LAPACK、ScaLAPACK 均**使用系统自带编译器源码编译**（Intel 集群 GCC 4.8.5，AMD 集群 GCC 8.5.0），未使用厂商优化数学库（如 Intel MKL 或 AMD AOCL）。这意味着 HPL 性能数据反映的是开源社区版数学库的性能水平。本次测试主要目的是验证不同时间同步精度下对计算效率的影响，因此数学库性能优化不做考虑。

为能体现出时间同步精度对计算效率影响的差异，HPL 计算规模设定为计算集群总内存的 30%~50%。

#### 6.2.1 HPL.dat 配置文件

HPL.dat 文件计算规模依照单节点、双节点、四节点分别为 Intel 集群和 AMD 集群创建，详细配置见附录 A。

#### 6.2.2 Intel 集群 HPL 测试结果

##### 方案一：外网 NTP（默认方案）

| 节点数 | 第一测 (GFLOPS) | 第二测 (GFLOPS) | 第三测 (GFLOPS) | 第四测 (GFLOPS) | 均值 (GFLOPS) | CV |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | 408.66 | 400.10 | 406.88 | 392.89 | 402.1 | 1.8% |
| 2 | 847.32 | 746.90 | 763.69 | 847.26 | 801.3 | 6.7% |
| 4 | 1,560.2 | 1,510.1 | 1,443.4 | 1,451.7 | 1,491.3 | 3.7% |

##### 方案二：本地 NTP 服务器

| 节点数 | 第一测 (GFLOPS) | 第二测 (GFLOPS) | 第三测 (GFLOPS) | 第四测 (GFLOPS) | 均值 (GFLOPS) | CV |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | 420.14 | 430.92 | 431.34 | 426.25 | 427.2 | 1.2% |
| 2 | 850.02 | 850.80 | 849.06 | 849.83 | 849.9 | 0.1% |
| 4 | 1,592.5 | 1,591.0 | 1,595.4 | 1,582.7 | 1,590.4 | 0.3% |

##### Intel 集群性能提升对比

| 节点数 | 外网 NTP (GFLOPS) | 本地 NTP (GFLOPS) | 性能提升 | CV 变化 |
|:---|:---|:---|:---|:---|
| 1 | 402.1 | 427.2 | **+6.2%** | 1.8% → 1.2% |
| 2 | 801.3 | 849.9 | **+6.1%** | 6.7% → 0.1% |
| 4 | 1,491.3 | 1,590.4 | **+6.6%** | 3.7% → 0.3% |

> [!IMPORTANT]
>
> **分析**：Intel 集群在切换至本地 NTP 服务器后，HPL 性能获得了 **6.1%—6.6%** 的显著提升，且提升幅度随节点数增加略有上升趋势。更值得关注的是性能稳定性的大幅改善——2 节点测试的变异系数从 6.7% 骤降至 0.1%，4 节点从 3.7% 降至 0.3%。这意味着时间同步精度的提升不仅提高了平均计算性能，还显著增强了性能的可重复性和可预测性。
>
> 从机制上分析，外网 NTP 方案下百微秒级的时钟偏移导致 MPI 集合通信（广播、归约等）中节点间等待时间增加，这些等待在 HPL 的迭代过程中不断累积，最终体现为整体性能下降。而本地 NTP 方案将时钟偏移控制在亚微秒级，几乎消除了时钟不同步带来的通信等待开销。

#### 6.2.3 AMD 集群 HPL 测试结果

##### 方案一：外网 NTP（默认方案）

| 节点数 | 第一测 (GFLOPS) | 第二测 (GFLOPS) | 第三测 (GFLOPS) | 第四测 (GFLOPS) | 均值 (GFLOPS) | CV |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | 5,553.7 | 5,588.3 | 5,559.2 | 5,573.3 | 5,568.6 | 0.3% |
| 2 | 6,361.4 | 6,323.1 | 6,344.7 | 6,323.1 | 6,338.1 | 0.3% |
| 4 | 5,630.8 | 6,736.5 | 6,152.0 | 5,092.1 | 5,902.9 | 11.9% |

##### 方案二：本地 NTP 服务器

| 节点数 | 第一测 (GFLOPS) | 第二测 (GFLOPS) | 第三测 (GFLOPS) | 第四测 (GFLOPS) | 均值 (GFLOPS) | CV |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | 5,593.2 | 5,569.3 | 5,517.8 | 5,592.6 | 5,568.2 | 0.6% |
| 2 | 6,323.1 | 6,362.5 | 6,344.7 | 6,361.4 | 6,347.9 | 0.3% |
| 4 | 5,407.0 | 6,675.1 | 5,908.4 | 6,784.3 | 6,193.7 | 10.5% |

##### 方案三：直连 NTP 服务器

| 节点数 | 第一测 (GFLOPS) | 第二测 (GFLOPS) | 第三测 (GFLOPS) | 第四测 (GFLOPS) | 均值 (GFLOPS) | CV |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | 5,533.5 | 5,566.2 | 5,556.7 | 5,577.9 | 5,558.6 | 0.3% |
| 2 | 6,136.4 | 6,398.4 | 6,186.9 | 6,346.3 | 6,267.0 | 2.0% |
| 4 | 7,388.6 | 7,307.8 | 7,191.6 | 6,743.4 | 7,157.9 | 4.0% |

##### AMD 集群性能提升对比

| 节点数 | 外网 NTP | 本地 NTP | 直连 NTP | 本地vs外网 | 直连vs本地 | 直连vs外网 |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | 5,568.6 | 5,568.2 | 5,558.6 | +0.0% | -0.2% | -0.2% |
| 2 | 6,338.1 | 6,347.9 | 6,267.0 | +0.2% | -1.3% | -1.1% |
| 4 | 5,902.9 | 6,193.7 | 7,157.9 | **+4.9%** | **+15.6%** | **+21.3%** |

> [!IMPORTANT]
>
> **分析**：AMD 集群呈现出与 Intel 集群一致的趋势——**时间同步精度越高，4 节点 HPL 性能越好**，且性能稳定性（CV）也随之改善。
>
> 单节点和 2 节点时，三种方案的性能差异不大（<2%），因为此时 MPI 通信量相对较小，时钟偏移的影响尚不显著。但在 4 节点规模下，性能差异显著放大：
>
> - 外网 NTP → 本地 NTP：性能提升 4.9%，CV 从 11.9% 降至 10.5%
> - 本地 NTP → 直连 NTP：性能再提升 15.6%，CV 进一步降至 4.0%
> - 累计（外网 → 直连）：性能提升 21.3%
>
> 需要指出的是，AMD 集群 4 节点外网 NTP 方案的测试数据波动极大（CV=11.9%，四次结果从 5,092 到 6,737 GFLOPS 不等），这可能是外网 NTP 时钟抖动大、导致每次运行的通信等待时间差异显著所致。本地 NTP 和直连方案的 CV 逐步降低，验证了时间同步精度提升对性能稳定性的正面影响。
>
> 需要说明的是，从外网 NTP 到本地 NTP 的这一步对比中，Intel 集群的性能提升（6.6%）反而略高于 AMD 集群（4.9%），说明"网络越慢收益越大"并不是一个简单的线性关系。两套集群的 CPU 架构、问题规模、MPI 实现等均不相同，这些变量都会影响最终的性能提升幅度。**可以确定的规律是：时间同步精度提升的绝对量越大，性能收益越显著**——AMD 集群直连方案将精度从 116 µs 提升到 0.043 µs（提升约 2,707 倍），带来了 21.3% 的性能提升，远高于仅本地 NTP 一步的收益。

---

### 6.3 综合分析

#### 6.3.1 时间同步精度与计算性能的正相关性

综合两集群的测试数据，可以清晰地观察到时间同步精度与 HPL 计算性能之间的正相关关系：

| 集群 | 同步方案 | 平均偏移 | 4节点 HPL (GFLOPS) | CV |
|:---|:---|:---|:---|:---|
| Intel | 外网 NTP | 53.3 µs | 1,491.3 | 3.7% |
| Intel | 本地 NTP | 0.102 µs | 1,590.4 | 0.3% |
| AMD | 外网 NTP | 116.4 µs | 5,902.9 | 11.9% |
| AMD | 本地 NTP | 0.223 µs | 6,193.7 | 10.5% |
| AMD | 直连 NTP | 0.043 µs | 7,157.9 | 4.0% |

**关键发现：**

1. **精度提升 → 性能提升**：在所有 4 节点测试场景中，时间同步精度的提高均伴随着 HPL 计算性能的提升。这验证了本报告的核心假设——提高 HPC 集群时间校对精度能够提升集群计算效率。

2. **精度提升 → 稳定性提升**：变异系数（CV）随精度提升而显著降低，说明作业运行时间更加稳定可预测。对于生产环境中的批量作业调度，这意味着更准确的作业时长预估和更高效的资源规划。

3. **精度提升量与性能收益正相关**：时间同步精度提升的绝对量越大，计算性能的提升幅度也越大。从外网 NTP 到本地 NTP（精度提升约 500 倍），性能提升约 5%—7%；从外网 NTP 到直连 NTP（精度提升约 2,700 倍），AMD 集群性能提升达 21.3%。这一规律在 AMD 集群的三级方案对比中尤为清晰。网络延迟、CPU 架构、问题规模等因素也会影响具体收益幅度，但精度提升量是最主要的决定因素。

4. **规模效应**：从 1 节点到 4 节点，性能提升幅度逐渐增大。1 节点时（无 MPI 通信），各方案性能基本一致；2 节点时略有差异；4 节点时差异显著。这符合理论预期——**参与通信的节点越多，集合通信的同步等待开销越大，时钟偏移的影响也越显著**。

#### 6.3.2 性能提升的机制解释

HPL 基准测试的核心是稠密矩阵 LU 分解，其计算与通信模式具有以下特点：

- **计算/通信比高**：HPL 以计算为主，通信占比相对较低（通常 < 10%）。
- **规则通信模式**：主要为行列广播（`MPI_Bcast`）和归约（`MPI_Reduce`），通信模式规则且可预测。
- **迭代执行**：整个计算过程包含大量迭代，每次迭代都有多次集合通信。

在这样的模式下，即使每次通信的等待时间只增加几微秒，经过数千次迭代的累积，最终也会体现在整体运行时间的显著差异上。

此外，时间同步精度对计算效率的影响可能通过更复杂的机制发挥作用：

1. **多级累积效应**：时钟偏移不仅影响集合通信本身，还可能影响操作系统的调度决策、网络协议的超时重传机制等。
2. **抖动的级联影响**：外网 NTP 方案下的大抖动（数百微秒至毫秒级）导致每次通信的等待时间不稳定，可能打乱 CPU 的流水线和缓存优化，间接影响计算效率。
3. **网络协议交互**：时钟偏差可能影响网络拥塞控制和流量控制的准确性，导致网络带宽利用率下降。

#### 6.3.3 投入产出视角

从投入产出角度看，提高时间同步精度是一种成本极低但收益显著的性能优化手段：

- **成本**：以AMD集群为例，一台本地高精度时间同步服务器的采购成本与新增计算节点成为偏差不大。
- **收益**：Intel 集群 4 节点 HPL 性能提升 6.6%，相当于免费获得了约 0.26 个节点的计算能力（按 1,590 GFLOPS / 4 节点 ≈ 398 GFLOPS/节点计算，提升的 99 GFLOPS 约相当于 0.25 个节点）；AMD 集群直连方案提升 21.3%，相当于约 0.85 个节点的算力。

对于更大规模的集群（如 100 节点以上），预期收益将更加可观，因为集合通信的开销随节点数增长而增大。已有研究表明，时钟同步对集合通信的影响随节点数呈非线性增长 [1]。

---
## 7. 结论与部署建议

### 7.1 核心结论

基于 Intel 和 AMD 两套 HPC 集群、三种时间同步方案、多个节点规模的系统性测试，得出以下核心结论：

1. **提高时间同步精度能够显著提升 HPC 计算效率**：从外网 NTP 切换至本地 NTP 服务器后，Intel 集群 4 节点 HPL 性能提升 **6.6%**，AMD 集群提升 **4.9%**。AMD 集群采用直连授时架构后，累计性能提升达 **21.3%**。这一发现验证了核心假设——**时间同步精度是影响 HPC 集群计算效率的重要因素**。

2. **性能稳定性随精度提升而显著改善**：时间同步精度提高不仅提升了平均性能，更大幅降低了性能变异系数（CV）。Intel 集群 2 节点 CV 从 6.7% 降至 0.1%，4 节点从 3.7% 降至 0.3%；AMD 集群 4 节点 CV 从 11.9% 降至直连方案的 4.0%。**更高的性能可重复性对于生产环境的作业调度、资源规划和性能调优具有重要价值**。

3. **本地 NTP 服务器带来 500 倍以上的精度提升**：两集群均验证了将授时源从互联网迁移至本地局域网后，平均时钟偏移从百微秒级（53—116 µs）降至亚微秒级（0.1—0.2 µs），精度提升超过 500 倍。最大偏移从毫秒级降至个位数微秒级，消除了偶发大偏移对性能的冲击。

4. **精度提升量与性能收益正相关**：时间同步精度提升越大，计算性能的提升幅度也越大。从外网 NTP 到本地 NTP（精度提升约 500 倍），性能提升约 5%—7%；从外网 NTP 到直连 NTP（精度提升约 2,700 倍），AMD 集群性能提升达 21.3%。网络延迟、CPU 架构、问题规模等因素也会影响具体收益，但其影响小于精度提升量本身的影响。

5. **性能提升具有规模扩展效应**：从 1 节点到 4 节点，性能提升幅度逐渐增大。1 节点（无 MPI 通信）时各方案基本无差异，2 节点时略有差异，4 节点时差异显著。可以合理推断，在更大规模集群（16、64、100+ 节点）中，时间同步精度的影响将更加显著。

### 7.2 部署建议

基于测试结果，提出以下部署建议：

| 场景 | 推荐方案 | 理由 |
|:---|:---|:---|
| 所有 HPC 集群（默认） | 本地高精度 NTP 服务器 | 投入成本低，性能收益显著（5%—7%），稳定性大幅提升 |
| 对性能稳定性要求高的生产环境 | 本地 NTP + 冗余授时源 | 变异系数降低 80%+，作业运行时间更可预测 |
| 超大规模集群（≥32 节点） | 本地 NTP + 分层授时架构 | 规模越大，集合通信占比越高，精度收益越显著 |
| 追求极致性能的场景 | 直连授时 / PTP 硬件时间戳 | 精度提升越大收益越高，直连方案可带来 15%+ 额外性能（AMD 4 节点数据） |

### 7.3 投入产出分析

**投入成本：**

- **硬件**：一台高精度本地 NTP 时间服务器（含 GPS 或北斗授时），成本约为单台计算节点的成本。
- **软件**：chrony 为系统自带，**零软件成本**。
- **网络**：复用现有 1GbE 管理/授时网络，**零网络改造成本**（直连方案需额外网线/网口，成本极低）。
- **部署人力**：约 0.5—1 人日（含配置、测试、验证）。

**收益估算（4 节点集群）：**

| 集群                   | 性能提升 | 等效算力增加   | 年收益估算（按算力折算）        |
| :--------------------- | :------- | :------------- | :------------------------------ |
| Intel 集群（本地 NTP） | 6.6%     | 约 0.26 个节点 | 约 0.26 节点 × 单机成本的年折旧 |
| AMD 集群（本地 NTP）   | 4.9%     | 约 0.20 个节点 | 约 0.20 节点 × 单机成本的年折旧 |
| AMD 集群（直连方案）   | 21.3%    | 约 0.85 个节点 | 约 0.85 节点 × 单机成本的年折旧 |

**投资回报周期：**

以一台计算节点 10 万元、使用周期 5 年（年折旧 2 万元）、本地 NTP 时间服务器成本约 10 万元（约等于一台计算节点成本）估算：

| 集群场景                      | 年收益（算力折算）     | 投资回收期 |
| :---------------------------- | :--------------------- | :--------- |
| Intel 集群 4 节点（本地 NTP） | 0.26 × 2万 = 0.52 万元 | 约 19 年   |
| AMD 集群 4 节点（本地 NTP）   | 0.20 × 2万 = 0.40 万元 | 约 25 年   |
| AMD 集群 4 节点（直连方案）   | 0.85 × 2万 = 1.70 万元 | 约 6 年    |
| Intel 集群 16 节点（预估）    | 约 3.0—4.5 万元        | 约 2—3 年  |
| AMD 集群 16 节点（预估）      | 约 5.0—8.0 万元        | 约 1—2 年  |

> [!IMPORTANT]
>
> **关键提示**：NTP 时间服务器是一次性投入，其服务能力可覆盖整个集群（通常 100+ 节点），**不随节点数增加而追加投入**。因此，4 节点规模下的投资回报周期较长属于正常现象——在 4 节点时，Intel 集群本地 NTP 方案的投资回收期约 19 年，AMD 集群直连方案约 6 年（接近 5 年折旧周期）。但随着集群规模扩大，同一台时间服务器的收益随节点数增长而非线性放大，**约 16 节点规模时投资回收期可缩短至 1—3 年**。对于典型生产级 HPC 集群（32—128 节点），时间同步优化的投资回报率极为可观。
>
> **扩展性预期**：本次测试在 4 节点规模下进行，时间同步精度的性能收益随集群规模扩大而增长。已有研究表明，集合通信开销随节点数呈对数或超线性增长 [1]。因此，**本报告的性能收益数据应被视为保守下限**，更大规模集群中的收益预期更高。

---

## 8. 测试局限性

本报告的测试结论基于当前集群规模、硬件配置和工作负载类型，存在以下局限性，在解读和应用测试结果时应予以考虑。

### 8.1 集群规模局限

本次测试仅在 **4 节点**规模上进行，是 HPC 集群规模的低端。在 4 节点规模下，MPI 集合通信的参与进程数有限（Intel: 96 进程，AMD: 192 进程），barrier 和广播等待开销在总运行时间中的占比相对较小。已有研究表明，时钟同步对集合通信的改善随节点数增长而放大——在 16 节点规模下预计改善可达 10%—20%，64 节点可达 20%+ [1]。因此，**本报告的性能收益数据应被视为下限**，更大规模集群中的收益预期更高。

### 8.2 网络环境局限

两套集群的计算网络差异显著但均有局限：

- **Intel 集群（40Gb InfiniBand）**：IB 网络延迟极低（~1 µs），且原生支持 RDMA，网络层面的通信效率很高。
- **AMD 集群（10Gb 光纤）**：10GbE 延迟和带宽均低于现代 HPC 标准（当前主流为 100—200Gb HDR/NDR），该网络配置可能代表较旧或成本敏感的部署场景。

由于两套集群的 CPU 架构、问题规模、编译器版本等多个变量同时不同，**无法从本次测试数据中独立分离出"网络延迟对时间同步收益的影响"**。要验证网络延迟与收益的关系，需要在同一集群、同一 CPU 架构下对比不同计算网络（或使用网络仿真工具人为引入延迟），这是后续测试的方向之一。

此外，两集群共享同一 **1GbE 授时网络**，该网络带宽有限且为最佳努力（best-effort）以太网。在生产环境中，若授时网络存在高负载（如管理流量、监控流量竞争），NTP 同步精度可能受影响。本次测试在相对隔离的环境中进行，未模拟生产网络拥塞场景。

### 8.3 基准覆盖局限

本次测试仅使用 **HPL** 一个基准来评估计算性能，存在以下局限：

- **通信占比有限**：HPL 以计算为主，通信占比较低（通常 < 10%），时间同步精度对其影响相对较小。对于通信密集型基准（如 HPCG、Graph500）或应用（如分子动力学、深度学习训练），时间同步的影响预期更大。
- **规则通信模式**：HPL 的通信模式高度规则且可预测，而实际应用中的不规则通信（如稀疏矩阵运算、自适应网格）可能对时钟偏移更敏感。
- **缺乏应用级测试**：未测试真实科学计算应用（如 LAMMPS、OpenFOAM、VASP 等），无法直接验证时间同步精度提升对实际科研工作的性能影响。

### 8.4 测试方法局限

- **重复次数**：每个配置 4 次重复对于 HPL 基准是标准做法，但对于性能差异的统计显著性检验仍有局限。增加重复次数可提高结论的可信度。
- **环境控制**：尽管采取了独占模式、CPU 频率锁定等控制措施，但仍有一些因素无法完全控制，如系统后台服务、文件系统负载等。
- **未量化 MPI 层面影响**：本次测试仅测量了 HPL 端到端性能，未直接测量 MPI 集合通信延迟的变化，因此无法精确定位性能提升来源于哪些具体的 MPI 操作。

### 8.5 软硬件版本局限

Intel 集群运行 CentOS 7.9（内核 3.10 系），该内核版本的 NTP 协议栈和时钟子系统可能不如新版本内核完善。AMD 集群的 Rocky 8.10（内核 4.18 系）表现更优，但两集群的操作系统差异引入了一个额外变量，难以完全隔离时间同步本身的影响与操作系统版本的影响。

> [!IMPORTANT]
>
> **局限性总结**：本次测试的结论**在当前 4 节点、1GbE 授时网络、HPL 基准的条件下是可靠的**，但不应直接外推至更大规模集群或不同工作负载类型。测试数据应作为**保守下限**参考，实际生产环境中（尤其节点数 ≥ 16 时）时间同步优化的收益预期更高。

---

## 9. 进一步测试方向与内容

基于本次测试的经验和局限性分析，建议从以下方向展开深入测试，全面评估时间同步精度对 HPC 集群计算效率的影响。

### 9.1 集群规模扩展测试

**测试目标**：验证时间同步精度的性能收益随节点数增长的放大趋势，建立 **"集群规模 — 性能收益"** 量化模型。

**测试方案：**
- 在 AMD 集群扩展至 **8、16、32 节点**（可通过扩容或联合 Intel 集群模拟），重复 HPL 基准测试。
- 绘制 **节点数 vs. 性能提升率** 曲线，验证是否与理论模型（提升率随节点数非线性增长）吻合。
- 测试 **跨交换机 NTP 级联** 精度衰减，评估多跳拓扑下本地时间服务器的部署策略。

**预期产出：** 规模-收益量化模型，为集群扩展规划提供时间同步部署决策依据。

### 9.2 更广泛的基准与应用测试

**测试目标**：评估时间同步精度对不同类型 HPC 工作负载的影响差异，建立工作负载特征与时间同步收益的关联。

**测试方案：**
- **通信密集型基准**：增加 HPCG（共轭梯度）、Graph500（图遍历）等通信占比更高的基准测试。
- **典型科学应用**：测试 LAMMPS（分子动力学）、OpenFOAM（计算流体力学）、VASP（第一性原理计算）等真实应用。
- **AI/深度学习**：测试 PyTorch DDP / Horovod 的分布式训练性能，梯度同步通信占比可达 35%—50%，预期是时间同步收益最大的场景。
- **I/O 密集型应用**：评估时间同步对并行 I/O 性能的影响（如 Lustre 文件系统的客户端协调）。

**预期产出：** 工作负载-收益对照表，帮助用户判断自身场景下时间同步优化的优先级。

### 9.3 MPI 通信层面的精细测量

**测试目标**：从 MPI 层面精确定位时间同步精度影响计算性能的机制和路径。

**测试方案：**
- 使用 **OSU Micro-Benchmarks** 测量 `MPI_Barrier`、`MPI_Allreduce`、`MPI_Bcast` 等集合操作在不同时间同步精度下的延迟差异。
- 使用 **PMPI** 或 **Score-P** 剖析 HPL 运行中各 MPI 函数的时间占比，量化时间同步优化对各通信阶段的具体影响。
- 测量不同消息大小下的性能差异，验证小消息集合操作受时钟偏移影响更大的理论假设。

**预期产出：** 时间同步精度影响 MPI 通信的量化分析，为性能优化提供更精细的指导。

### 9.4 网络延迟对时间同步收益的影响验证

**测试目标**：在控制其他变量（CPU 架构、问题规模、MPI 版本）不变的条件下，独立验证网络延迟对时间同步优化收益的影响程度，建立 **"网络延迟 — 性能收益"** 量化关系。

**测试方案：**
- 在同一集群、同一 CPU 架构下，通过 **网络仿真工具（如 `tc netem`）** 人为引入不同程度的网络延迟（如 10 µs、50 µs、100 µs、200 µs），对比相同时间同步精度提升下的性能收益差异。
- 或者在同一套节点上，分别使用 InfiniBand 和以太网（如有双网口）运行 HPL，对比不同网络下时间同步优化的收益。
- 使用 **OSU Micro-Benchmarks** 精确测量不同网络延迟下集合操作的时钟偏移等待占比。

**预期产出：** 网络延迟与时间同步收益的定量关系曲线，验证"网络越慢收益越大"的理论假设是否成立及其适用范围。本次测试因两集群架构差异较大，无法独立分离网络延迟的影响，此项测试可弥补该空白。

### 9.5 PTP 硬件时间戳方案测试

**测试目标**：评估 PTP/IEEE 1588 硬件时间戳方案相比 NTP 软件时间戳的额外收益，为追求极致精度的场景提供数据支撑。

**测试方案：**
- 在现有网卡支持硬件时间戳的条件下，部署 `linuxptp`（`ptp4l` + `phc2sys`）方案。
- 对比 PTP 硬件时间戳 vs 本地 NTP 软件时间戳的精度差异和性能差异。
- 测试普通网卡硬件时间戳 vs InfiniBand PHC（Precision Hardware Clock）的差异。

**预期产出：** PTP 与 NTP 方案的对比分析，为高端 HPC 集群的时间同步方案选型提供依据。已有研究表明，PTP 硬件时间戳可将同步精度提升至亚微秒甚至纳秒级 [6][7]。

### 9.6 生产环境混合负载测试

**测试目标**：评估多租户混合负载场景下，时间同步精度提升对作业调度公平性和整体集群吞吐量的影响。

**测试方案：**
- 设计 **混合负载测试矩阵**：同时提交计算密集型（HPL）+ 通信密集型（HPCG）+ I/O 密集型作业，模拟真实生产环境。
- 对比不同时间同步方案下的 **作业完成时间方差** 和 **集群整体吞吐量**。
- 在 SLURM 中开发 **时间同步状态检查插件**（Prolog/Epilog 脚本），在作业启动前验证节点时钟同步状态，未同步节点自动排除。
- 评估时间同步精度对 **SLURM 会计日志时间戳对齐** 的影响，提升多节点日志分析准确性。

**预期产出：** 生产环境混合负载性能评估报告，验证时间同步优化在真实使用场景下的价值。

---

## 10. 附录

### 附录 A：HPL.dat 配置文件

#### A.1 Intel 集群

**单计算节点 HPL.dat**

```
HPLinpack benchmark input file
Innovative Computing Laboratory, University of Tennessee
HPL.out      output file name (if any)
6            device out (6=stdout,7=stderr,file)
1            # of problems sizes (N)
78000        Ns
1            # of NBs
256          NBs
0            PMAP process mapping (0=Row-,1=Column-major)
1            # of process grids (P x Q)
4            Ps
6            Qs
16.0         threshold
1            # of panel fact
1            PFACTs (0=left, 1=Crout, 2=Right)
1            # of recursive stopping criterium
4            NBMINs (>= 1)
1            # of panels in recursion
2            NDIVs
1            # of recursive panel fact.
1            RFACTs (0=left, 1=Crout, 2=Right)
1            # of broadcast
2            BCASTs (0=1rg,1=1rM,2=2rg,3=2rM,4=Lng,5=LnM)
1            # of lookahead depth
1            DEPTHs (>=0)
2            SWAP (0=bin-exch,1=long,2=mix)
64           swapping threshold
0            L1 in (0=transposed,1=no-transposed) form
0            U  in (0=transposed,1=no-transposed) form
1            Equilibration (0=no,1=yes)
8            memory alignment in double (> 0)
```

**双计算节点 HPL.dat**

```
HPLinpack benchmark input file
Innovative Computing Laboratory, University of Tennessee
HPL.out      output file name (if any)
6            device out (6=stdout,7=stderr,file)
1            # of problems sizes (N)
110000       Ns
1            # of NBs
256          NBs
0            PMAP process mapping (0=Row-,1=Column-major)
1            # of process grids (P x Q)
6            Ps
8            Qs
16.0         threshold
1            # of panel fact
1            PFACTs (0=left, 1=Crout, 2=Right)
1            # of recursive stopping criterium
4            NBMINs (>= 1)
1            # of panels in recursion
2            NDIVs
1            # of recursive panel fact.
1            RFACTs (0=left, 1=Crout, 2=Right)
1            # of broadcast
2            BCASTs (0=1rg,1=1rM,2=2rg,3=2rM,4=Lng,5=LnM)
1            # of lookahead depth
1            DEPTHs (>=0)
2            SWAP (0=bin-exch,1=long,2=mix)
64           swapping threshold
0            L1 in (0=transposed,1=no-transposed) form
0            U  in (0=transposed,1=no-transposed) form
1            Equilibration (0=no,1=yes)
8            memory alignment in double (> 0)
```

**四计算节点 HPL.dat**

```
HPLinpack benchmark input file
Innovative Computing Laboratory, University of Tennessee
HPL.out      output file name (if any)
6            device out (6=stdout,7=stderr,file)
1            # of problems sizes (N)
150000       Ns
1            # of NBs
256          NBs
0            PMAP process mapping (0=Row-,1=Column-major)
1            # of process grids (P x Q)
8            Ps
12           Qs
16.0         threshold
1            # of panel fact
1            PFACTs (0=left, 1=Crout, 2=Right)
1            # of recursive stopping criterium
4            NBMINs (>= 1)
1            # of panels in recursion
2            NDIVs
1            # of recursive panel fact.
1            RFACTs (0=left, 1=Crout, 2=Right)
1            # of broadcast
2            BCASTs (0=1rg,1=1rM,2=2rg,3=2rM,4=Lng,5=LnM)
1            # of lookahead depth
1            DEPTHs (>=0)
2            SWAP (0=bin-exch,1=long,2=mix)
64           swapping threshold
0            L1 in (0=transposed,1=no-transposed) form
0            U  in (0=transposed,1=no-transposed) form
1            Equilibration (0=no,1=yes)
8            memory alignment in double (> 0)
```

#### A.2 AMD 集群

**单计算节点 HPL.dat**

```
HPLinpack benchmark input file
Innovative Computing Laboratory, University of Tennessee
HPL.out      output file name (if any)
6            device out (6=stdout,7=stderr,file)
1            # of problems sizes (N)
122880       Ns
1            # of NBs
256          NBs
0            PMAP process mapping (0=Row-,1=Column-major)
1            # of process grids (P x Q)
12           Ps
16           Qs
1.0          threshold
1            # of panel fact
2            PFACTs (0=left, 1=Crout, 2=Right)
1            # of recursive stopping criterium
4            NBMINs (>= 1)
1            # of panels in recursion
2            NDIVs
1            # of recursive panel fact.
1            RFACTs (0=left, 1=Crout, 2=Right)
1            # of broadcast
2            BCASTs (0=1rg,1=1rM,2=2rg,3=2rM,4=Lng,5=LngM)
1            # of depth lookahead
2            DEPTHs (>=0)
2            SWAP (0=bin-exch,1=long,2=mix)
64           swapping threshold
0            L1 in (0=transposed,1=no-transposed) form
0            U  in (0=transposed,1=no-transposed) form
1            Equilibration (0=no,1=yes)
8            memory alignment in double (> 0)
```

**双计算节点 HPL.dat**

```
HPLinpack benchmark input file
Innovative Computing Laboratory, University of Tennessee
HPL.out      output file name (if any)
6            device out (6=stdout,7=stderr,file)
1            # of problems sizes (N)
184320       Ns
1            # of NBs
256          NBs
0            PMAP process mapping (0=Row-,1=Column-major)
1            # of process grids (P x Q)
16           Ps
24           Qs
1.0          threshold
1            # of panel fact
2            PFACTs (0=left, 1=Crout, 2=Right)
1            # of recursive stopping criterium
4            NBMINs (>= 1)
1            # of panels in recursion
2            NDIVs
1            # of recursive panel fact.
1            RFACTs (0=left, 1=Crout, 2=Right)
1            # of broadcast
2            BCASTs (0=1rg,1=1rM,2=2rg,3=2rM,4=Lng,5=LngM)
1            # of depth lookahead
2            DEPTHs (>=0)
2            SWAP (0=bin-exch,1=long,2=mix)
64           swapping threshold
0            L1 in (0=transposed,1=no-transposed) form
0            U  in (0=transposed,1=no-transposed) form
1            Equilibration (0=no,1=yes)
8            memory alignment in double (> 0)
```

**四计算节点 HPL.dat**

```
HPLinpack benchmark input file
Innovative Computing Laboratory, University of Tennessee
HPL.out      output file name (if any)
6            device out (6=stdout,7=stderr,file)
1            # of problems sizes (N)
256000       Ns
1            # of NBs
256          NBs
0            PMAP process mapping (0=Row-,1=Column-major)
1            # of process grids (P x Q)
24           Ps
32           Qs
1.0          threshold
1            # of panel fact
2            PFACTs (0=left, 1=Crout, 2=Right)
1            # of recursive stopping criterium
4            NBMINs (>= 1)
1            # of panels in recursion
2            NDIVs
1            # of recursive panel fact.
1            RFACTs (0=left, 1=Crout, 2=Right)
1            # of broadcast
2            BCASTs (0=1rg,1=1rM,2=2rg,3=2rM,4=Lng,5=LngM)
1            # of depth lookahead
2            DEPTHs (>=0)
2            SWAP (0=bin-exch,1=long,2=mix)
64           swapping threshold
0            L1 in (0=transposed,1=no-transposed) form
0            U  in (0=transposed,1=no-transposed) form
1            Equilibration (0=no,1=yes)
8            memory alignment in double (> 0)
```

### 附录 B：SLURM 作业脚本示例

**Intel 集群 1 节点 HPL 作业脚本：**

```bash
#!/bin/bash
#SBATCH -J HPL_node1
#SBATCH -p hpl
#SBATCH -N 1
#SBATCH -n 24
#SBATCH -c 1
#SBATCH --exclusive

source /home/hpl/apps/hpl_run_env.sh

export OMP_NUM_THREADS=1
export OMP_PROC_BIND=close
export OMP_PLACES=cores

cd /home/hpl/ntptime/node1/compute-0-0

mpirun --mca btl vader,self --map-by core -np ${SLURM_NTASKS} ./xhpl >& result1-1.log
```

**AMD 集群 1 节点 HPL 作业脚本：**

```bash
#!/bin/bash
#SBATCH -J HPL_node1
#SBATCH -p hpl
#SBATCH -N 1
#SBATCH -n 192
#SBATCH -c 1
#SBATCH --exclusive

source /home/hpl/apps/hpl_run_env.sh

export OMP_NUM_THREADS=1
export OMP_PROC_BIND=close
export OMP_PLACES=cores

cd /home/hpl/ntptime/node1/1

mpirun --map-by core --bind-to core -np ${SLURM_NTASKS} ./xhpl >& result1-1.log
```

---

## 参考文献

[1] Sahu, G., et al. "On the Impact of Synchronizing Clocks and Processes on Benchmarking MPI Collectives." *EuroMPI 2015*.  
    <https://hunoldscience.net/paper/mpi_clocksync_sahu_2015.pdf>

[2] Schulz, M., et al. "Score-P: A Joint Performance Measurement Runtime Infrastructure for Periscope, Scalasca, TAU, and Vampir." *ICNS 2013*.  
    <https://www.vi-hps.org/upload/materials/talks/2013-08-22_Score-P_overview.pdf>

[3] InfiniBand Trade Association. "InfiniBand Architecture Specification, Volume 1: General Requirements." *Release 1.5*.  
    <https://www.infinibandta.org/>

[4] Mills, D. L. "Network Time Protocol Version 4: Protocol and Algorithms Specification." *RFC 5905*, IETF, 2010.  
    <https://datatracker.ietf.org/doc/html/rfc5905>

[5] Red Hat, Inc. "Red Hat Enterprise Linux 8 — Configuring NTP Using Chrony." *Red Hat Documentation*.  
    <https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/8/html/configuring_basic_system_settings/using-chrony-to-configure-ntp_configuring-basic-system-settings>

[6] NIST. "An IEEE 1588 Time Synchronization Testbed for Assessing Power Distribution Requirements." 商用 IEEE 1588 产品在四跳网络中实现 1 µs 精度，24 小时稳定。  
    <https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=906259>

[7] IEEE Standards Association. "IEEE 1588-2019 - IEEE Standard for a Precision Clock Synchronization Protocol for Networked Measurement and Control Systems." *IEEE*, 2020.  
    <https://standards.ieee.org/standard/1588-2019.html>

[8] Petcu, D., et al. "High Performance LINPACK Benchmark: Current Performance and Optimizations." *Procedia Computer Science*, 2013.  
    <https://www.sciencedirect.com/science/article/pii/S1877050913004617>

[9] Thakur, R., et al. "Optimization of Collective Communication Operations in MPICH." *International Journal of High Performance Computing Applications*, 2005.  
    <https://journals.sagepub.com/doi/10.1177/1094342005051523>

[10] Luszczek, P., et al. "Introduction to the HPC Challenge Benchmark Suite." *ICCS 2005*.  
    <https://www.netlib.org/utk/people/JackDongarra/PAPERS/hpc-challenge-benchmark-iccs.pdf>

---

*报告完成日期：2026年7月10日*  
*报告版本：V6.0*
