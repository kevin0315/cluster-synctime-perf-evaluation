#!/bin/bash
#SBATCH -J HPL_node3
#SBATCH -p hpl
#SBATCH -N 1
#SBATCH -n 24
#SBATCH -c 1
#SBATCH --exclusive

source /home/hpl/apps/hpl_run_env.sh

export OMP_NUM_THREADS=1
export OMP_PROC_BIND=close
export OMP_PLACES=cores

cd /home/hpl/notime/node1/compute-0-2

mpirun --mca btl vader,self --map-by core -np ${SLURM_NTASKS} ./xhpl >& result1-3.log
