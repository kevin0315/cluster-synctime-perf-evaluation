#!/bin/bash
#SBATCH -J HPL_4node
#SBATCH -p hpl
#SBATCH -N 4
#SBATCH -n 96
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

cd /home/hpl/ntptime/node4

mpirun --map-by core -np ${SLURM_NTASKS} ./xhpl >& result_4node.log
