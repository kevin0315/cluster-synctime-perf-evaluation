#!/bin/bash
#SBATCH -J HPL_node4
#SBATCH -p hpl
#SBATCH -N 4
#SBATCH -n 768
#SBATCH -c 1
#SBATCH --exclusive

source /home/hpl/apps/hpl_run_env.sh

export OMP_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export OMP_PROC_BIND=close
export OMP_PLACES=cores

export OMPI_MCA_btl="tcp,self"
export OMPI_MCA_btl_tcp_if_include=enp129s0f0
export OMPI_MCA_btl_tcp_failover_enabled=0
export OMPI_MCA_mpi_yield_when_idle=1

cd /home/hpl/notime/node4/1

mpirun --map-by core --bind-to core -np ${SLURM_NTASKS} ./xhpl >& result4-4.log
