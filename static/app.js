(function() {
  const DateTime = luxon.DateTime;
  const urlSearchParams = new URLSearchParams(window.location.search);
  let bookingSpanMeetingLength = 15;
  if (urlSearchParams.has('d')) {
    const d = parseInt(urlSearchParams.get('d'));
    if (!isNaN(d) && d >= 15 && d <= 60 && d % 15 == 0) {
      bookingSpanMeetingLength = d;
    }
  }
  const app = Vue.createApp({
    data() {
      return {
        availabilityData: {},
        loaded: false,
        loadedFirstTime: false,
        error: false,
        bookingSpan: null,
        bookingSpanMeetingLength: bookingSpanMeetingLength,
        email: '',
        lastUpdateAgo: '',
        lastUpdate: '',
        timezone: '',
        timezoneUTCOffset: '',
        localTimezone: DateTime.local().zoneName,
        localTimezoneUTCOffset: 'UTC' + DateTime.local().toFormat('ZZ'),
        currentFirstDay: undefined,
        selectedDay: undefined,
        monthAvailabilityData: undefined,
        selectedSlot: undefined,
        h24: true,
      };
    },
    mounted: function() {
      this.email = this.$el.parentNode.dataset['email'];
    },
    computed: {
      monthAvailability: function() {
        if (this.monthAvailabilityData === undefined) {
          return undefined;
        }
        const obj = {};
        this.monthAvailabilityData.forEach((item, index) => {
          obj[DateTime.fromISO(item[0]).day] = item[1];
        })
        return obj;
      },
      googleCalendarLink: function() {
        if (this.selectedSlot === undefined) {
          return '';
        }
        return (
          'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Let%27s%20Talk&dates=' +
          encodeURI(this.selectedSlot.id) +
          '&add=' + encodeURI(this.email)
        );
      },
      iCalLink: function() {
        if (this.selectedSlot === undefined) {
          return '';
        }
        return encodeURI(
          'data:text/calendar;charset=utf8,' +
          [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'DTSTART:'      + this.selectedSlot.parts[0].toFormat("yyyyMMdd'T'HHmmss'Z'"),
            'DTEND:'        + this.selectedSlot.parts[1].toFormat("yyyyMMdd'T'HHmmss'Z'"),
            'SUMMARY:'      + "Let's Talk",
            'ATTENDEE:'     + this.email,
            'END:VEVENT',
            'END:VCALENDAR'
          ].join('\n')
        );
      },
      bookingSpanLength: function() {
        if (this.bookingSpan === null) {
          return 0;
        }
        const start = DateTime.fromFormat(this.bookingSpan[0], "HH:mm", { zone: 'UTC' });
        const end = DateTime.fromFormat(this.bookingSpan[1], "HH:mm", { zone: 'UTC' });
        return (end - start) / 60_000.0;
      },
      bookableSlots: function() {
        if (this.bookingSpan === null) {
          return [];
        }

        const slots = [];
        const startHHMM = DateTime.fromFormat(this.bookingSpan[0], "HH:mm", { zone: 'UTC' });
        const endHHMM = DateTime.fromFormat(this.bookingSpan[1], "HH:mm", { zone: 'UTC' });

        const start = this.selectedDay.set({
          hour: startHHMM.hour,
          minute: startHHMM.minute,
          second: 0,
          millisecond: 0,
        });
        const end = this.selectedDay.set({
          hour: endHHMM.hour,
          minute: endHHMM.minute,
          second: 0,
          millisecond: 0,
        });
        let dt = start;
        const lastPossibleStart = end.minus({ minute: this.bookingSpanMeetingLength });
        while (dt <= lastPossibleStart) {
          const dtEnd = dt.plus({ minute: this.bookingSpanMeetingLength });
          slots.push({
            id: dt.toFormat("yyyyMMdd'T'HHmmss'Z/'") + dtEnd.toFormat("yyyyMMdd'T'HHmmss'Z'"),
            parts: [dt, dtEnd],
            span: [
              dt.toFormat('T'),
              dtEnd.toFormat('T'),
            ]
          });
          dt = dt.plus({ minute: 15 });
        }
        return slots;
      }
    },
    methods: {
      fetchAvailability() {
        axios.get('/availability').then(response => {
            this.availabilityData = response.data;
            this.lastUpdateAgo = DateTime.fromISO(this.availabilityData['last-update']).toRelative();
            this.lastUpdate = DateTime.fromISO(this.availabilityData['last-update']).toLocaleString(DateTime.DATETIME_SHORT);
            this.timezone = this.availabilityData['timezone'];
            this.timezoneUTCOffset = 'UTC' + DateTime.local().setZone(this.availabilityData['timezone']).toFormat('ZZ'),
            this.loaded = true;
            this.loadedFirstTime = true;
        }).catch(function (error) {
            this.error = true;
            console.log(error);
        });
      },
      loadMoreAvailability() {
        axios.get('/availability?start_date=' + DateTime.fromISO(this.availabilityData['next-date']).toISODate()).then(response => {
          this.availabilityData['next-date'] = response.data['next-date'];
          this.availabilityData['end-date'] = response.data['end-date'];
          this.availabilityData.data.push(...response.data.data);
          this.lastUpdateAgo = DateTime.fromISO(response.data['last-update']).toRelative();
          this.lastUpdate = DateTime.fromISO(response.data['last-update']).toLocaleString(DateTime.DATETIME_SHORT);
        }).catch(function (error) {
          this.error = true;
          console.log(error);
        });
      },
      loadMonthAvailability() {
        const startDate = this.currentFirstDay;
        const endDate = this.currentFirstDay.endOf('month');
        this.loaded = false;
        this.bookingSpan = null;
        this.selectedSlot = undefined;
        axios.get('/availability?start_date=' + startDate.toISODate() + '&end_date=' + endDate.toISODate()).then(response => {
          this.monthAvailabilityData = response.data.data;
          this.availabilityData = response.data;
          this.lastUpdateAgo = DateTime.fromISO(this.availabilityData['last-update']).toRelative();
          this.lastUpdate = DateTime.fromISO(this.availabilityData['last-update']).toLocaleString(DateTime.DATETIME_SHORT);
          this.timezone = this.availabilityData['timezone'];
          this.timezoneUTCOffset = 'UTC' + DateTime.local().setZone(this.availabilityData['timezone']).toFormat('ZZ'),
          this.loaded = true;
          this.loadedFirstTime = true;
        }).catch(function (error) {
          this.error = true;
          console.log(error);
        });
      },
      hugeDate(date) {
        return date.toLocaleString(DateTime.DATE_HUGE);
      },
      localizedISOSpan(span) {
        return DateTime.fromISO(span, { zone: 'UTC' }).setZone('local').toFormat(this.h24 ? 'HH:mm' : 'hh:mm a')
      },
      localizedSpan(span) {
        return DateTime.fromFormat(span, 'T', { zone: 'UTC' }).setZone('local').toFormat(this.h24 ? 'HH:mm' : 'hh:mm a')
      },
      handleMonthChanged(firstDay) {
        this.currentFirstDay = firstDay;
        this.selectedDay = firstDay;
        this.loadMonthAvailability();
      },
      handleSelectedDayChanged(selectedDay) {
        this.selectedDay = selectedDay;
        this.bookingSpan = null;
        this.selectedSlot = undefined;
      },
      bookInSpan(span) {
        this.bookingSpan = span;
        this.bookingSpanRangeStart = 0;
      },
    },
    delimiters: ['${', '}']
  });

  app.component('calendar', {
    data() {
      const today = DateTime.utc();
      return {
        month: today.month,
        firstDay: today.startOf('month'),
        selectedDay: today,
        today: today,
        todayDay: today.day,
        canGoBackward: false,
        canGoForward: true,
        currentMonth: true,
      }
    },
    props: ['monthAvailability'],
    methods: {
      getWeeksCount() {
        const lastDay = this.today.endOf('month');
        // A month spans 4 weeks exact if it's 28 days, then it's February, and it must end on a Sunday
        if (this.month == 2 && lastDay.weekday == 7) {
          return 4;
        }

        // A month spans 6 weeks if it's:
        // 31 days start on Saturday or Sunday
        // 30 days start on Sunday
        if (lastDay.day == 31 && this.firstDay.weekday >= 6) {
          return 6;
        }
        if (lastDay.day == 30 && this.firstDay.weekday == 7) {
          return 6;
        }

        // Otherwise a month spans 5 weeks
        return 5;
      },
      getWeeks() {
        let dt = this.firstDay;
        const lastDay = this.firstDay.endOf('month');
        const weeks = [];
        let week = [];
        for (let i = 0; i < dt.weekday - 1; i++) {
          week.push(undefined);
        }
        while (dt <= lastDay) {
          week.push(dt.day);
          if (week.length == 7) {
            weeks.push(week);
            week = [];
          }
          dt = dt.plus({days: 1})
        }
        if (week.length != 0) {
          weeks.push(week);
        }
        return weeks;
      },
      monthName() {
        return this.firstDay.toFormat('MMMM yyyy')
      },
      goBackward() {
        if (!this.canGoBackward) {
          return;
        }
        const previousMonthLastDay = this.firstDay.minus({days: 1});
        const previousMonthFirstDay = previousMonthLastDay.startOf('month');
        if (previousMonthFirstDay > this.today) {
          this.canGoBackward = true;
          this.selectedDay = previousMonthFirstDay;
          this.currentMonth = false;
        } else {
          this.canGoBackward = false;
          this.currentMonth = true;
          if (previousMonthFirstDay == this.today) {
            this.selectedDay = previousMonthFirstDay;
          } else {
            this.selectedDay = this.today;
          }
        }
        this.month = previousMonthFirstDay.month;
        this.firstDay = previousMonthFirstDay;
        this.canGoForward = true;
        this.$emit('monthChanged', this.selectedDay);
      },
      goForward() {
        if (!this.canGoForward) {
          return;
        }
        const nextMonthFirstDay = this.firstDay.endOf('month').plus({days: 1});
        this.month = nextMonthFirstDay.month;
        this.firstDay = nextMonthFirstDay;
        this.selectedDay = nextMonthFirstDay;
        this.canGoBackward = true;
        this.canGoForward = true;
        this.currentMonth = false;
        this.$emit('monthChanged', this.selectedDay);
      },
      chooseDay(day) {
        if (this.currentMonth && day < this.todayDay) {
          return;
        }
        if (this.monthAvailability !== undefined && this.monthAvailability[day].length == 0) {
          return;
        }
        this.selectedDay = this.firstDay.set({day: day});
        this.$emit('selectedDayChanged', this.selectedDay);
      },
      getDayClasses(day) {
        const classes = [];
        if (this.currentMonth && day == this.todayDay) {
          classes.push('today');
          classes.push('day');
        } else if (this.currentMonth && day < this.todayDay) {
          classes.push('past');
        } else {
          classes.push('day');
          if (this.monthAvailability !== undefined) {
            if (this.monthAvailability[day] !== undefined && this.monthAvailability[day].length == 0) {
              classes.push('unavailable');
            }
          }
        }
        if (this.selectedDay.day == day) {
          classes.push('selected');
        }
        return classes;
      }
    },
    created() {
      this.$emit('monthChanged', this.selectedDay);
    },
    emits: ['selectedDayChanged', 'monthChanged'],
    template: `
    <div class="calendar user-select-none">
      <table class="text-center">
        <thead>
          <tr>
            <th class="calendar-navigation" :class="[canGoBackward ? 'enabled' : 'disabled']" @click="goBackward()">&#10094;</th>
            <th class="month" colspan="5">{{ monthName() }}</th>
            <th class="calendar-navigation" :class="[canGoForward ? 'enabled' : 'disabled']" @click="goForward()">&#10095;</th>
          </tr>
          <tr class="days">
            <th>Mon</th>
            <th>Tue</th>
            <th>Wed</th>
            <th>Thu</th>
            <th>Fri</th>
            <th>Sat</th>
            <th>Sun</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, index) in getWeeks()" class="week" :class="[(index % 2) == 0 ? 'odd' : 'even']">
            <template v-for="day in week">
              <template v-if="day !== undefined">
                <td @click="chooseDay(day)" :class="getDayClasses(day)"><span>{{ day }}</span></td>
              </template>
              <td v-else class="empty"></td>
            </template>
          </tr>
        </tbody>
        <tfoot></tfoot>
      </table>
    </div>`
  });
  const mountedApp = app.mount('#app');
  window.mountedApp = mountedApp;
})();
