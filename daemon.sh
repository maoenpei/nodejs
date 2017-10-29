
echo "$$">pid_daemon
while true
do
  pid=`cat pid`
  psr=`ps -A | grep ${pid}`
  if [ ! "$psr" ]; then
    dt=`date +%s`
    mv nohup.out logs/nohup_${dt}.out
    touch nohup.out
    ./run.sh
    echo "stopped and resumed! ${dt}"
  else
    echo "alive"
  fi
  sleep 2
done
