package clock

import "time"

type Clock interface {
	Now() time.Time
}

type RealClock struct{}

func NewRealClock() Clock {
	return RealClock{}
}

func (RealClock) Now() time.Time {
	return time.Now()
}
