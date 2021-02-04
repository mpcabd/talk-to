(function() {
  let DateTime = luxon.DateTime;
  const app = Vue.createApp({
    data() {
      return {
        availabilityData: {},
        loaded: false,
        loadedFirstTime: false,
        error: false,
        bookingSpan: null,
        bookingSpanMeetingLength: 15,
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
        let start = DateTime.fromFormat(this.bookingSpan[0], "HH:mm", { zone: 'UTC' });
        let end = DateTime.fromFormat(this.bookingSpan[1], "HH:mm", { zone: 'UTC' });
        return (end - start) / 60_000.0;
      },
      bookableSlots: function() {
        if (this.bookingSpan === null) {
          return [];
        }

        let slots = [];
        let start = DateTime.fromFormat(this.bookingSpan[0], "HH:mm", { zone: 'UTC' });
        let end = DateTime.fromFormat(this.bookingSpan[1], "HH:mm", { zone: 'UTC' });
        let dt = this.selectedDay.set({
          hour: start.hour,
          minute: start.minute,
          seconds: 0,
          millisecond: 0,
        });
        let lastPossibleStart = end.minus({ minutes: this.bookingSpanMeetingLength });
        while (dt <= lastPossibleStart) {
          let dtEnd = dt.plus({ minutes: this.bookingSpanMeetingLength });
          slots.push({
            id: dt.toFormat("yyyyMMdd'T'HHmmss'Z/'") + dtEnd.toFormat("yyyyMMdd'T'HHmmss'Z'"),
            parts: [dt, dtEnd],
            span: [
              dt.toFormat('T'),
              dtEnd.toFormat('T'),
            ]
          });
          dt = dt.plus({ minutes: 15 });
        }
        return slots;
      }
    },
    methods: {
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
    delimiters: ['${', '}']  // because I use Jinja for my templates
  });

  app.component('calendar', {
    data() {
      let today = DateTime.utc();
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
      getWeeks() {
        let dt = this.firstDay;
        const lastDay = this.firstDay.endOf('month');
        let weeks = [];
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
        let previousMonthLastDay = this.firstDay.minus({days: 1});
        let previousMonthFirstDay = previousMonthLastDay.startOf('month');
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
        let nextMonthFirstDay = this.firstDay.endOf('month').plus({days: 1});
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
        let classes = [];
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
})();