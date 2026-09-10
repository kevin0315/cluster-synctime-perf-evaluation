#!/bin/bash
# ptp_result.sh —— 采集集群各节点 PTP 偏移(offset)并统计平均/最大偏移与抖动
#
# 重要说明:
#   1. pmc 的 GET CURRENT_DATA_SET 返回的 offsetFromMaster 单位是【纳秒 ns】, 不是秒
#   2. pmc 通过 UDS 套接字(/var/run/ptp4l)与本机 ptp4l 通信, 一般需要 root 权限
#   3. 远程节点需提前配置 SSH 免密登录, 否则对应节点采样失败(不影响其他节点)

########### 配置参数 ##########
sample_num=720
interval=10
csvfile="./result.csv"
logfile="./result.log"
errfile="./result.err"          # 采样错误信息, 用于排障
nodes=(compute-0-1 compute-0-2 compute-0-3)
ssh_opts=(-x -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR)
###############################

# 兼容 cron 环境: 源码编译安装的 pmc 默认在 /usr/local/sbin, cron 的 PATH 通常不含它
export PATH="/usr/local/sbin:/usr/local/bin:${PATH}"

tmperr=$(mktemp)
trap 'rm -f "${tmperr}"' EXIT

declare -A prev_offset

echo "sample_id,time,hostname,offset_ns,jitter_ns" > "${csvfile}"
: > "${errfile}"

for (( s=1; s<=sample_num; s++ )); do
    echo "==== PTP采样 $s / ${sample_num} [$(date '+%F %T')] ===="

    for host in "${nodes[@]}"; do
        offset="NaN"

        if [[ "${host}" == "localhost" ]]; then
            out=$(timeout 10 pmc -u -b 0 'GET CURRENT_DATA_SET' 2>"${tmperr}")
        else
            out=$(timeout 20 ssh "${ssh_opts[@]}" "${host}" "pmc -u -b 0 'GET CURRENT_DATA_SET'" 2>"${tmperr}")
        fi
        rc=$?

        if [[ ${rc} -eq 0 ]]; then
            # pmc 输出形如: "offsetFromMaster	-253.0", 单位 ns
            offset=$(printf '%s\n' "${out}" | awk '$1=="offsetFromMaster"{print $2; exit}')
            [[ -z "${offset}" ]] && offset="NaN"
        else
            # 关键改动: 单节点失败不退出脚本, 记录错误后继续采样
            echo "[$(date '+%F %T')] ${host} 采样失败(rc=${rc}): $(tr '\n' ' ' <"${tmperr}")" | tee -a "${errfile}" >&2
        fi

        # 抖动 = |当前offset - 上次offset|, 相邻两次均有效才计算
        jitter="NaN"
        prev="${prev_offset[$host]:-}"
        if [[ "${offset}" != "NaN" && -n "${prev}" && "${prev}" != "NaN" ]]; then
            jitter=$(awk -v a="${offset}" -v b="${prev}" 'BEGIN{d=a-b; printf "%.3f", (d<0?-d:d)}')
        fi
        prev_offset[$host]="${offset}"

        echo "${s},$(date '+%F %T'),${host},${offset},${jitter}" >> "${csvfile}"
    done

    # 最后一次采样结束后不再额外等待
    [[ ${s} -lt ${sample_num} ]] && sleep "${interval}"
done

echo ""
echo "采样结束，开始统计计算..."

# 统计: 分节点 + 集群整体; 最大偏移取绝对值; NaN/失败样本不计入
awk -F',' -v nodelist="${nodes[*]}" -v samples="${sample_num}" -v itv="${interval}" -v errlog="${errfile}" '
BEGIN { nn = split(nodelist, hosts, / +/) }
NR>1 {
    if (!start) start = $2
    end = $2
    h = $3
    if ($4 != "" && $4 != "NaN") {
        n[h]++; sum[h] += $4
        a = ($4 < 0 ? -$4 : $4)
        if (a > mo[h]) mo[h] = a
        N++; SUM += $4
        if (a > MO) MO = a
    } else {
        fail[h]++
    }
    if ($5 != "" && $5 != "NaN") {
        jn[h]++; jsum[h] += $5
        if ($5 > mj[h]) mj[h] = $5
        JN++; JSUM += $5
        if ($5 > MJ) MJ = $5
    }
}
END {
    printf("===== PTP集群时间同步统计结果 =====\n")
    printf("采样配置 : 共 %d 次, 间隔 %d 秒\n", samples, itv)
    if (start) printf("采样时段 : %s ~ %s\n", start, end)
    printf("偏移单位 : 纳秒 ns (1 s = 1e9 ns)\n\n")

    if (N == 0) {
        printf("警告：无任何有效PTP采样数据！常见原因:\n")
        printf("  1) ptp4l 未运行        : systemctl status ptp4l\n")
        printf("  2) 无权限访问UDS套接字 : 请用 root(或 sudo)运行本脚本\n")
        printf("  3) SSH 未配置免密登录  : ssh-keygen && ssh-copy-id <节点>\n")
        printf("  4) 具体报错信息见: %s\n", errlog)
        exit
    }

    printf("%-14s %8s %14s %14s %14s %14s\n", "节点", "有效样本", "平均偏移ns", "最大偏移ns", "平均抖动ns", "最大抖动ns")
    printf("%-14s %8s %14s %14s %14s %14s\n", "------", "--------", "----------", "----------", "----------", "----------")
    for (i=1; i<=nn; i++) {
        h = hosts[i]
        o_avg = (n[h]  ? sprintf("%.1f", sum[h]/n[h])   : "-")
        o_max = (n[h]  ? sprintf("%.1f", mo[h])         : "-")
        j_avg = (jn[h] ? sprintf("%.1f", jsum[h]/jn[h]) : "-")
        j_max = (jn[h] ? sprintf("%.1f", mj[h])         : "-")
        printf("%-14s %8d %14s %14s %14s %14s\n", h, n[h]+0, o_avg, o_max, j_avg, j_max)
    }
    printf("%-14s %8d %14.1f %14.1f %14.1f %14.1f\n", "集群整体", N, SUM/N, MO, (JN ? JSUM/JN : 0), MJ)

    printf("\n")
    for (i=1; i<=nn; i++) {
        h = hosts[i]
        if (fail[h] > 0) printf("警告: 节点 %s 有 %d 次采样失败, 详见 %s\n", h, fail[h], errlog)
    }
    printf("\n说明: 平均偏移为带符号平均(正=超前主钟, 负=落后主钟); 最大偏移取绝对值最大点;\n")
    printf("      抖动 = 相邻两次有效采样 offset 差值的绝对值\n")
}
' "${csvfile}" > "${logfile}"

cat "${logfile}"
echo ""
echo "原始采样文件: ${csvfile}"
echo "统计结果文件: ${logfile}"
echo "错误信息文件: ${errfile} (为空表示无采样错误)"
