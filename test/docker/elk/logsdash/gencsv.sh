#!/bin/zsh

repeat $1; {
    print "$(date +%Y%m%d_%H:%M:%S),$RANDOM" >> test.csv
    sleep 1
}
