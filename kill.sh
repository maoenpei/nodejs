kill `cat pid_daemon`
kill `cat pid`
dt=`date +%s`
mv nohup.out logs/nohup_${dt}.out

