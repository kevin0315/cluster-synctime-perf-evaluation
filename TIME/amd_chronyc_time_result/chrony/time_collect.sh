#!/bin/bash
# time_collect.sh
sample_num=720
interval=10
csvfile="./result.csv"
logfile="./result.log"

nodes=(compute-0-0 compute-0-1 compute-0-2 compute-0-3)

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
        printf("Last‑offset平均(秒)          : %.9f\n", avg_off)
        printf("Last‑offset最大值(秒)        : %.9f\n", max_off)
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
