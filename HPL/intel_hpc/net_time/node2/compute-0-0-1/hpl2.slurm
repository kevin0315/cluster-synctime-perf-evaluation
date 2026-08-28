#!/bin/bash
#SBATCH -J HPL_2node-0-1
#SBATCH -p hpl
#SBATCH -N 2
#SBATCH -n 48
#SBATCH -c 1
#SBATCH --exclusive

source /home/hpl/apps/hpl_run_env.sh

export OMP_NUM_THREADS=1
export OMP_PROC_BIND=close
export OMP_PLACES=cores

# IB环境变量
export OMPI_MCA_btl="vader,self,openib"
export OMPI_MCA_btl_openib_allow_ib=1
export OMPI_MCA_btl_openib_timeout=30

cd /home/hpl/ntptime/node2/compute-0-0-1

mpirun --map-by core -np ${SLURM_NTASKS} ./xhpl >& result1_2node-0-1.log
