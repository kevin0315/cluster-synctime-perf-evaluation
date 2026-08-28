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

cd /home/hpl/notime/node1/3

mpirun --map-by core --bind-to core -np ${SLURM_NTASKS} ./xhpl >& result1-3.log
