import { Directive, ElementRef, EventEmitter, HostBinding, HostListener, Inject, Input, isDevMode, Output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, combineLatest, pipe, Subject, animationFrameScheduler } from 'rxjs';
import { auditTime, filter, map, share, startWith, takeUntil, throttleTime } from 'rxjs/operators';
import * as i0 from "@angular/core";
export class StickyThingDirective {
    set marginTop(value) {
        this.marginTop$.next(value);
    }
    set marginBottom(value) {
        this.marginBottom$.next(value);
    }
    set enable(value) {
        this.enable$.next(value);
    }
    constructor(stickyElement, platformId) {
        this.stickyElement = stickyElement;
        this.platformId = platformId;
        this.filterGate = false;
        this.marginTop$ = new BehaviorSubject(0);
        this.marginBottom$ = new BehaviorSubject(0);
        this.enable$ = new BehaviorSubject(true);
        this.auditTime = 0;
        this.sticky = false;
        this.isSticky = false;
        this.boundaryReached = false;
        this.upperBoundReached = false;
        this.stickyStatus = new EventEmitter();
        this.stickyPosition = new EventEmitter();
        /**
         * The field represents some position values in normal (not sticky) mode.
         * If the browser size or the content of the page changes, this value must be recalculated.
         * */
        this.scroll$ = new Subject();
        this.target = this.getScrollTarget();
        this.resize$ = new Subject();
        this.extraordinaryChange$ = new BehaviorSubject(undefined);
        this.componentDestroyed = new Subject();
        this.listener = (e) => {
            const upperScreenEdgeAt = e.target.scrollTop || window.pageYOffset;
            this.scroll$.next(upperScreenEdgeAt);
        };
        /**
         * Throttle the scroll to animation frame (around 16.67ms) */
        this.scrollThrottled$ = this.scroll$
            .pipe(throttleTime(0, animationFrameScheduler), share());
        /**
         * Throttle the resize to animation frame (around 16.67ms) */
        this.resizeThrottled$ = this.resize$
            .pipe(throttleTime(0, animationFrameScheduler), 
        // emit once since we are currently using combineLatest
        startWith(null), share());
        this.status$ = combineLatest(this.enable$, this.scrollThrottled$, this.marginTop$, this.marginBottom$, this.extraordinaryChange$, this.resizeThrottled$)
            .pipe(filter(([enabled]) => this.checkEnabled(enabled)), map(([enabled, pageYOffset, marginTop, marginBottom]) => this.determineStatus(this.determineElementOffsets(), pageYOffset, marginTop, marginBottom, enabled)), share());
    }
    ngAfterViewInit() {
        const operators = this.scrollContainer ?
            pipe(takeUntil(this.componentDestroyed)) :
            pipe(auditTime(this.auditTime), takeUntil(this.componentDestroyed));
        this.status$
            .pipe(operators)
            .subscribe((status) => {
            this.setSticky(status);
            this.setStatus(status);
        });
    }
    recalculate() {
        if (isPlatformBrowser(this.platformId)) {
            // Make sure to be in the next tick by using timeout
            setTimeout(() => {
                this.extraordinaryChange$.next(undefined);
            }, 0);
        }
    }
    /**
     * This is nasty code that should be refactored at some point.
     *
     * The Problem is, we filter for enabled. So that the code doesn't run
     * if @Input enabled = false. But if the user disables, we need exactly 1
     * emit in order to reset and call removeSticky. So this method basically
     * turns the filter in "filter, but let the first pass".
     * */
    checkEnabled(enabled) {
        if (!isPlatformBrowser(this.platformId)) {
            return false;
        }
        if (enabled) {
            // reset the gate
            this.filterGate = false;
            return true;
        }
        else {
            if (this.filterGate) {
                // gate closed, first emit has happened
                return false;
            }
            else {
                // this is the first emit for enabled = false,
                // let it pass, and activate the gate
                // so the next wont pass.
                this.filterGate = true;
                return true;
            }
        }
    }
    onWindowResize() {
        if (isPlatformBrowser(this.platformId)) {
            this.resize$.next();
        }
    }
    setupListener() {
        if (isPlatformBrowser(this.platformId)) {
            const target = this.getScrollTarget();
            target.addEventListener('scroll', this.listener);
        }
    }
    ngOnInit() {
        this.checkSetup();
        this.setupListener();
    }
    ngOnDestroy() {
        this.target.removeEventListener('scroll', this.listener);
        this.componentDestroyed.next();
    }
    getScrollTarget() {
        let target;
        if (this.scrollContainer && typeof this.scrollContainer === 'string') {
            target = document.querySelector(this.scrollContainer);
            this.marginTop$.next(Infinity);
            this.auditTime = 0;
        }
        else if (this.scrollContainer && this.scrollContainer instanceof HTMLElement) {
            target = this.scrollContainer;
            this.marginTop$.next(Infinity);
            this.auditTime = 0;
        }
        else {
            target = window;
        }
        return target;
    }
    getComputedStyle(el) {
        return el.getBoundingClientRect();
    }
    determineStatus(originalVals, pageYOffset, marginTop, marginBottom, enabled) {
        const elementPos = this.determineElementOffsets();
        let isSticky = enabled && pageYOffset > originalVals.offsetY;
        if (pageYOffset < elementPos.offsetY) {
            isSticky = false;
        }
        const stickyElementHeight = this.getComputedStyle(this.stickyElement.nativeElement).height;
        const reachedLowerEdge = (this.boundaryElement != null) ? this.boundaryElement && window.pageYOffset + stickyElementHeight + marginBottom >= (originalVals.bottomBoundary - marginTop * 1.0) : undefined;
        const reachedUpperEdge = (this.boundaryElement != null) ? window.pageYOffset < (this.boundaryElement.offsetTop + marginTop * 1.0) : undefined;
        this.stickyPosition.emit({ ...elementPos, upperScreenEdgeAt: pageYOffset, marginBottom, marginTop });
        return {
            isSticky,
            reachedUpperEdge,
            reachedLowerEdge,
        };
    }
    // not always pixel. e.g. ie9
    getMargins() {
        const stickyStyles = window.getComputedStyle(this.stickyElement.nativeElement);
        const top = parseInt(stickyStyles.marginTop, 10);
        const bottom = parseInt(stickyStyles.marginBottom, 10);
        return { top, bottom };
    }
    /**
     * Gets the offset for element. If the element
     * currently is sticky, it will get removed
     * to access the original position. Other
     * wise this would just be 0 for fixed elements. */
    determineElementOffsets() {
        if (this.sticky) {
            this.removeSticky();
        }
        let bottomBoundary = null;
        if (this.boundaryElement) {
            const boundaryElementHeight = this.getComputedStyle(this.boundaryElement).height;
            const boundaryElementOffset = getPosition(this.boundaryElement).y;
            bottomBoundary = boundaryElementHeight + boundaryElementOffset;
        }
        return {
            offsetY: (getPosition(this.stickyElement.nativeElement).y - this.marginTop$.value), bottomBoundary
        };
    }
    makeSticky(boundaryReached = false, marginTop, marginBottom) {
        // do this before setting it to pos:fixed
        const { width, height, left } = this.getComputedStyle(this.stickyElement.nativeElement);
        const offSet = boundaryReached ? (this.getComputedStyle(this.boundaryElement).bottom - height - this.marginBottom$.value) : this.marginTop$.value;
        if (this.scrollContainer && !this.sticky) {
            this.stickyElement.nativeElement.style.position = 'sticky';
            this.stickyElement.nativeElement.style.top = '0px';
            this.sticky = true;
        }
        else {
            this.stickyElement.nativeElement.style.position = 'fixed';
            this.stickyElement.nativeElement.style.top = offSet + 'px';
            this.stickyElement.nativeElement.style.left = left + 'px';
            this.stickyElement.nativeElement.style.width = `${width}px`;
        }
        if (this.spacerElement) {
            const spacerHeight = marginBottom + height + marginTop;
            this.spacerElement.style.height = `${spacerHeight}px`;
        }
    }
    determineBoundaryReached(boundaryHeight, stickyElHeight, cssMargins, marginTop, marginBottom, upperScreenEdgeAt) {
        const boundaryElementPos = getPosition(this.boundaryElement);
        const boundaryElementLowerEdge = boundaryElementPos.y + boundaryHeight;
        const lowerEdgeStickyElement = upperScreenEdgeAt + stickyElHeight + marginTop + cssMargins.top + marginBottom + cssMargins.bottom;
        return boundaryElementLowerEdge <= lowerEdgeStickyElement;
    }
    checkSetup() {
        if (isDevMode() && !this.spacerElement) {
            console.warn(`******There might be an issue with your sticky directive!******

You haven't specified a spacer element. This will cause the page to jump.

Best practise is to provide a spacer element (e.g. a div) right before/after the sticky element.
Then pass the spacer element as input:

<div #spacer></div>

<div stickyThing="" [spacer]="spacer">
    I am sticky!
</div>`);
        }
    }
    setSticky(status) {
        if (status.isSticky) {
            if (this.upperBoundReached) {
                this.removeSticky();
                this.isSticky = false;
            }
            else {
                this.makeSticky(status.reachedLowerEdge, status.marginTop, status.marginBottom);
                this.isSticky = true;
            }
        }
        else {
            this.removeSticky();
        }
    }
    setStatus(status) {
        this.upperBoundReached = status.reachedUpperEdge;
        this.boundaryReached = status.reachedLowerEdge;
        this.stickyStatus.next(status);
    }
    removeSticky() {
        this.boundaryReached = false;
        this.sticky = false;
        this.stickyElement.nativeElement.style.position = '';
        this.stickyElement.nativeElement.style.width = 'auto';
        this.stickyElement.nativeElement.style.left = 'auto';
        this.stickyElement.nativeElement.style.top = 'auto';
        if (this.spacerElement) {
            this.spacerElement.style.height = '0';
        }
    }
}
StickyThingDirective.ɵfac = function StickyThingDirective_Factory(t) { return new (t || StickyThingDirective)(i0.ɵɵdirectiveInject(i0.ElementRef), i0.ɵɵdirectiveInject(PLATFORM_ID)); };
StickyThingDirective.ɵdir = /*@__PURE__*/ i0.ɵɵdefineDirective({ type: StickyThingDirective, selectors: [["", "stickyThing", ""]], hostVars: 6, hostBindings: function StickyThingDirective_HostBindings(rf, ctx) { if (rf & 1) {
        i0.ɵɵlistener("resize", function StickyThingDirective_resize_HostBindingHandler() { return ctx.onWindowResize(); }, false, i0.ɵɵresolveWindow);
    } if (rf & 2) {
        i0.ɵɵclassProp("is-sticky", ctx.isSticky)("boundary-reached", ctx.boundaryReached)("upper-bound-reached", ctx.upperBoundReached);
    } }, inputs: { scrollContainer: "scrollContainer", auditTime: "auditTime", marginTop: "marginTop", marginBottom: "marginBottom", enable: "enable", spacerElement: ["spacer", "spacerElement"], boundaryElement: ["boundary", "boundaryElement"] }, outputs: { stickyStatus: "stickyStatus", stickyPosition: "stickyPosition" } });
(function () { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(StickyThingDirective, [{
        type: Directive,
        args: [{
                selector: '[stickyThing]'
            }]
    }], function () { return [{ type: i0.ElementRef }, { type: undefined, decorators: [{
                type: Inject,
                args: [PLATFORM_ID]
            }] }]; }, { scrollContainer: [{
            type: Input
        }], auditTime: [{
            type: Input
        }], marginTop: [{
            type: Input
        }], marginBottom: [{
            type: Input
        }], enable: [{
            type: Input
        }], spacerElement: [{
            type: Input,
            args: ['spacer']
        }], boundaryElement: [{
            type: Input,
            args: ['boundary']
        }], isSticky: [{
            type: HostBinding,
            args: ['class.is-sticky']
        }], boundaryReached: [{
            type: HostBinding,
            args: ['class.boundary-reached']
        }], upperBoundReached: [{
            type: HostBinding,
            args: ['class.upper-bound-reached']
        }], stickyStatus: [{
            type: Output
        }], stickyPosition: [{
            type: Output
        }], onWindowResize: [{
            type: HostListener,
            args: ['window:resize', []]
        }] }); })();
// Thanks to https://stanko.github.io/javascript-get-element-offset/
function getPosition(el) {
    let top = 0;
    let left = 0;
    let element = el;
    // Loop through the DOM tree
    // and add it's parent's offset to get page offset
    do {
        top += element.offsetTop || 0;
        left += element.offsetLeft || 0;
        element = element.offsetParent;
    } while (element);
    return {
        y: top,
        x: left,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RpY2t5LXRoaW5nLmRpcmVjdGl2ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3Byb2plY3RzL2FuZ3VsYXItc3RpY2t5LXRoaW5ncy9zcmMvbGliL3N0aWNreS10aGluZy5kaXJlY3RpdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUVMLFNBQVMsRUFDVCxVQUFVLEVBQ1YsWUFBWSxFQUNaLFdBQVcsRUFDWCxZQUFZLEVBQ1osTUFBTSxFQUNOLEtBQUssRUFDTCxTQUFTLEVBR1QsTUFBTSxFQUNOLFdBQVcsRUFDWixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUNsRCxPQUFPLEVBQUMsZUFBZSxFQUFFLGFBQWEsRUFBYyxJQUFJLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFDLE1BQU0sTUFBTSxDQUFDO0FBQ3hHLE9BQU8sRUFBQyxTQUFTLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUMsTUFBTSxnQkFBZ0IsQ0FBQzs7QUFzQmpHLE1BQU0sT0FBTyxvQkFBb0I7SUFTL0IsSUFBYSxTQUFTLENBQUMsS0FBYTtRQUNsQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsSUFBYSxZQUFZLENBQUMsS0FBYTtRQUNyQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBYSxNQUFNLENBQUMsS0FBYztRQUNoQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBMEJELFlBQW9CLGFBQXlCLEVBQStCLFVBQWtCO1FBQTFFLGtCQUFhLEdBQWIsYUFBYSxDQUFZO1FBQStCLGVBQVUsR0FB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O2tCQUE3QixLQUFLO21CQUFDLFFBQVE7WUFDSSxlQUFlO2tCQUFqQyxLQUFLO21CQUFDLFVBQVU7WUFFZSxRQUFRO2tCQUF2QyxXQUFXO21CQUFDLGlCQUFpQjtZQUNTLGVBQWU7a0JBQXJELFdBQVc7bUJBQUMsd0JBQXdCO1lBQ0ssaUJBQWlCO2tCQUExRCxXQUFXO21CQUFDLDJCQUEyQjtZQUM5QixZQUFZO2tCQUFyQixNQUFNO1lBQ0csY0FBYztrQkFBdkIsTUFBTTtZQWdIUCxjQUFjO2tCQURiLFlBQVk7bUJBQUMsZUFBZSxFQUFFLEVBQUU7O0FBa0xuQyxvRUFBb0U7QUFDcEUsU0FBUyxXQUFXLENBQUMsRUFBRTtJQUNyQixJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7SUFDWixJQUFJLElBQUksR0FBRyxDQUFDLENBQUM7SUFDYixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7SUFFakIsNEJBQTRCO0lBQzVCLGtEQUFrRDtJQUNsRCxHQUFHO1FBQ0QsR0FBRyxJQUFJLE9BQU8sQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDO1FBQzlCLElBQUksSUFBSSxPQUFPLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQztRQUNoQyxPQUFPLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQztLQUNoQyxRQUFRLE9BQU8sRUFBRTtJQUVsQixPQUFPO1FBQ0wsQ0FBQyxFQUFFLEdBQUc7UUFDTixDQUFDLEVBQUUsSUFBSTtLQUNSLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQWZ0ZXJWaWV3SW5pdCxcbiAgRGlyZWN0aXZlLFxuICBFbGVtZW50UmVmLFxuICBFdmVudEVtaXR0ZXIsXG4gIEhvc3RCaW5kaW5nLFxuICBIb3N0TGlzdGVuZXIsXG4gIEluamVjdCxcbiAgSW5wdXQsXG4gIGlzRGV2TW9kZSxcbiAgT25EZXN0cm95LFxuICBPbkluaXQsXG4gIE91dHB1dCxcbiAgUExBVEZPUk1fSURcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQge2lzUGxhdGZvcm1Ccm93c2VyfSBmcm9tICdAYW5ndWxhci9jb21tb24nO1xuaW1wb3J0IHtCZWhhdmlvclN1YmplY3QsIGNvbWJpbmVMYXRlc3QsIE9ic2VydmFibGUsIHBpcGUsIFN1YmplY3QsIGFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyfSBmcm9tICdyeGpzJztcbmltcG9ydCB7YXVkaXRUaW1lLCBmaWx0ZXIsIG1hcCwgc2hhcmUsIHN0YXJ0V2l0aCwgdGFrZVVudGlsLCB0aHJvdHRsZVRpbWV9IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIFN0aWNreVBvc2l0aW9ucyB7XG4gIG9mZnNldFk6IG51bWJlcjtcbiAgYm90dG9tQm91bmRhcnk6IG51bWJlciB8IG51bGw7XG4gIHVwcGVyU2NyZWVuRWRnZUF0PzogbnVtYmVyO1xuICBtYXJnaW5Ub3A/OiBudW1iZXI7XG4gIG1hcmdpbkJvdHRvbT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdGlja3lTdGF0dXMge1xuICBpc1N0aWNreTogYm9vbGVhbjtcbiAgcmVhY2hlZFVwcGVyRWRnZTogYm9vbGVhbjtcbiAgcmVhY2hlZExvd2VyRWRnZTogYm9vbGVhbjtcbiAgbWFyZ2luVG9wPzogbnVtYmVyO1xuICBtYXJnaW5Cb3R0b20/OiBudW1iZXI7XG59XG5cbkBEaXJlY3RpdmUoe1xuICBzZWxlY3RvcjogJ1tzdGlja3lUaGluZ10nXG59KVxuZXhwb3J0IGNsYXNzIFN0aWNreVRoaW5nRGlyZWN0aXZlIGltcGxlbWVudHMgT25Jbml0LCBBZnRlclZpZXdJbml0LCBPbkRlc3Ryb3kge1xuXG4gIGZpbHRlckdhdGUgPSBmYWxzZTtcbiAgbWFyZ2luVG9wJCA9IG5ldyBCZWhhdmlvclN1YmplY3QoMCk7XG4gIG1hcmdpbkJvdHRvbSQgPSBuZXcgQmVoYXZpb3JTdWJqZWN0KDApO1xuICBlbmFibGUkID0gbmV3IEJlaGF2aW9yU3ViamVjdCh0cnVlKTtcblxuICBASW5wdXQoKSBzY3JvbGxDb250YWluZXI6IHN0cmluZyB8IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuICBASW5wdXQoKSBhdWRpdFRpbWUgPSAwO1xuICBASW5wdXQoKSBzZXQgbWFyZ2luVG9wKHZhbHVlOiBudW1iZXIpIHtcbiAgICB0aGlzLm1hcmdpblRvcCQubmV4dCh2YWx1ZSk7XG4gIH1cblxuICBASW5wdXQoKSBzZXQgbWFyZ2luQm90dG9tKHZhbHVlOiBudW1iZXIpIHtcbiAgICB0aGlzLm1hcmdpbkJvdHRvbSQubmV4dCh2YWx1ZSk7XG4gIH1cblxuICBASW5wdXQoKSBzZXQgZW5hYmxlKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5lbmFibGUkLm5leHQodmFsdWUpO1xuICB9XG4gIEBJbnB1dCgnc3BhY2VyJykgc3BhY2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG4gIEBJbnB1dCgnYm91bmRhcnknKSBib3VuZGFyeUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuICBzdGlja3kgPSBmYWxzZTtcbiAgQEhvc3RCaW5kaW5nKCdjbGFzcy5pcy1zdGlja3knKSBpc1N0aWNreSA9IGZhbHNlO1xuICBASG9zdEJpbmRpbmcoJ2NsYXNzLmJvdW5kYXJ5LXJlYWNoZWQnKSBib3VuZGFyeVJlYWNoZWQgPSBmYWxzZTtcbiAgQEhvc3RCaW5kaW5nKCdjbGFzcy51cHBlci1ib3VuZC1yZWFjaGVkJykgdXBwZXJCb3VuZFJlYWNoZWQgPSBmYWxzZTtcbiAgQE91dHB1dCgpIHN0aWNreVN0YXR1czogRXZlbnRFbWl0dGVyPFN0aWNreVN0YXR1cz4gPSBuZXcgRXZlbnRFbWl0dGVyPFN0aWNreVN0YXR1cz4oKTtcbiAgQE91dHB1dCgpIHN0aWNreVBvc2l0aW9uOiBFdmVudEVtaXR0ZXI8U3RpY2t5UG9zaXRpb25zPiA9IG5ldyBFdmVudEVtaXR0ZXI8U3RpY2t5UG9zaXRpb25zPigpO1xuXG4gIC8qKlxuICAgKiBUaGUgZmllbGQgcmVwcmVzZW50cyBzb21lIHBvc2l0aW9uIHZhbHVlcyBpbiBub3JtYWwgKG5vdCBzdGlja3kpIG1vZGUuXG4gICAqIElmIHRoZSBicm93c2VyIHNpemUgb3IgdGhlIGNvbnRlbnQgb2YgdGhlIHBhZ2UgY2hhbmdlcywgdGhpcyB2YWx1ZSBtdXN0IGJlIHJlY2FsY3VsYXRlZC5cbiAgICogKi9cbiAgcHJpdmF0ZSBzY3JvbGwkID0gbmV3IFN1YmplY3Q8bnVtYmVyPigpO1xuICBwcml2YXRlIHNjcm9sbFRocm90dGxlZCQ6IE9ic2VydmFibGU8bnVtYmVyPjtcbiAgcHJpdmF0ZSB0YXJnZXQgPSB0aGlzLmdldFNjcm9sbFRhcmdldCgpO1xuXG4gIHByaXZhdGUgcmVzaXplJCA9IG5ldyBTdWJqZWN0PHZvaWQ+KCk7XG4gIHByaXZhdGUgcmVzaXplVGhyb3R0bGVkJDogT2JzZXJ2YWJsZTx2b2lkPjtcbiAgcHJpdmF0ZSBleHRyYW9yZGluYXJ5Q2hhbmdlJCA9IG5ldyBCZWhhdmlvclN1YmplY3Q8dm9pZD4odW5kZWZpbmVkKTtcblxuICBwcml2YXRlIHN0YXR1cyQ6IE9ic2VydmFibGU8U3RpY2t5U3RhdHVzPjtcblxuICBwcml2YXRlIGNvbXBvbmVudERlc3Ryb3llZCA9IG5ldyBTdWJqZWN0PHZvaWQ+KCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBzdGlja3lFbGVtZW50OiBFbGVtZW50UmVmLCBASW5qZWN0KFBMQVRGT1JNX0lEKSBwcml2YXRlIHBsYXRmb3JtSWQ6IHN0cmluZykge1xuXG4gICAgLyoqXG4gICAgICogVGhyb3R0bGUgdGhlIHNjcm9sbCB0byBhbmltYXRpb24gZnJhbWUgKGFyb3VuZCAxNi42N21zKSAqL1xuICAgIHRoaXMuc2Nyb2xsVGhyb3R0bGVkJCA9IHRoaXMuc2Nyb2xsJFxuICAgICAgLnBpcGUoXG4gICAgICAgIHRocm90dGxlVGltZSgwLCBhbmltYXRpb25GcmFtZVNjaGVkdWxlciksXG4gICAgICAgIHNoYXJlKClcbiAgICAgICk7XG5cbiAgICAvKipcbiAgICAgKiBUaHJvdHRsZSB0aGUgcmVzaXplIHRvIGFuaW1hdGlvbiBmcmFtZSAoYXJvdW5kIDE2LjY3bXMpICovXG4gICAgdGhpcy5yZXNpemVUaHJvdHRsZWQkID0gdGhpcy5yZXNpemUkXG4gICAgICAucGlwZShcbiAgICAgICAgdGhyb3R0bGVUaW1lKDAsIGFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyKSxcbiAgICAgICAgLy8gZW1pdCBvbmNlIHNpbmNlIHdlIGFyZSBjdXJyZW50bHkgdXNpbmcgY29tYmluZUxhdGVzdFxuICAgICAgICBzdGFydFdpdGgobnVsbCksXG4gICAgICAgIHNoYXJlKClcbiAgICAgICk7XG5cblxuICAgIHRoaXMuc3RhdHVzJCA9IGNvbWJpbmVMYXRlc3QoXG4gICAgICB0aGlzLmVuYWJsZSQsXG4gICAgICB0aGlzLnNjcm9sbFRocm90dGxlZCQsXG4gICAgICB0aGlzLm1hcmdpblRvcCQsXG4gICAgICB0aGlzLm1hcmdpbkJvdHRvbSQsXG4gICAgICB0aGlzLmV4dHJhb3JkaW5hcnlDaGFuZ2UkLFxuICAgICAgdGhpcy5yZXNpemVUaHJvdHRsZWQkLFxuICAgIClcbiAgICAgIC5waXBlKFxuICAgICAgICBmaWx0ZXIoKFtlbmFibGVkXSkgPT4gdGhpcy5jaGVja0VuYWJsZWQoZW5hYmxlZCkpLFxuICAgICAgICBtYXAoKFtlbmFibGVkLCBwYWdlWU9mZnNldCwgbWFyZ2luVG9wLCBtYXJnaW5Cb3R0b21dKSA9PiB0aGlzLmRldGVybWluZVN0YXR1cyh0aGlzLmRldGVybWluZUVsZW1lbnRPZmZzZXRzKCksIHBhZ2VZT2Zmc2V0LCBtYXJnaW5Ub3AsIG1hcmdpbkJvdHRvbSwgZW5hYmxlZCkpLFxuICAgICAgICBzaGFyZSgpLFxuICAgICAgKTtcblxuICB9XG5cbiAgbmdBZnRlclZpZXdJbml0KCk6IHZvaWQge1xuICAgIGNvbnN0IG9wZXJhdG9ycyA9IHRoaXMuc2Nyb2xsQ29udGFpbmVyID9cbiAgICAgIHBpcGUodGFrZVVudGlsKHRoaXMuY29tcG9uZW50RGVzdHJveWVkKSkgOlxuICAgICAgcGlwZShhdWRpdFRpbWUodGhpcy5hdWRpdFRpbWUpLCB0YWtlVW50aWwodGhpcy5jb21wb25lbnREZXN0cm95ZWQpKTtcbiAgICB0aGlzLnN0YXR1cyRcbiAgICAgIC5waXBlKG9wZXJhdG9ycylcbiAgICAgIC5zdWJzY3JpYmUoKHN0YXR1czogU3RpY2t5U3RhdHVzKSA9PiB7XG4gICAgICAgIHRoaXMuc2V0U3RpY2t5KHN0YXR1cyk7XG4gICAgICAgIHRoaXMuc2V0U3RhdHVzKHN0YXR1cyk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHB1YmxpYyByZWNhbGN1bGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAoaXNQbGF0Zm9ybUJyb3dzZXIodGhpcy5wbGF0Zm9ybUlkKSkge1xuICAgICAgLy8gTWFrZSBzdXJlIHRvIGJlIGluIHRoZSBuZXh0IHRpY2sgYnkgdXNpbmcgdGltZW91dFxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMuZXh0cmFvcmRpbmFyeUNoYW5nZSQubmV4dCh1bmRlZmluZWQpO1xuICAgICAgfSwgMCk7XG4gICAgfVxuICB9XG5cblxuICAvKipcbiAgICogVGhpcyBpcyBuYXN0eSBjb2RlIHRoYXQgc2hvdWxkIGJlIHJlZmFjdG9yZWQgYXQgc29tZSBwb2ludC5cbiAgICpcbiAgICogVGhlIFByb2JsZW0gaXMsIHdlIGZpbHRlciBmb3IgZW5hYmxlZC4gU28gdGhhdCB0aGUgY29kZSBkb2Vzbid0IHJ1blxuICAgKiBpZiBASW5wdXQgZW5hYmxlZCA9IGZhbHNlLiBCdXQgaWYgdGhlIHVzZXIgZGlzYWJsZXMsIHdlIG5lZWQgZXhhY3RseSAxXG4gICAqIGVtaXQgaW4gb3JkZXIgdG8gcmVzZXQgYW5kIGNhbGwgcmVtb3ZlU3RpY2t5LiBTbyB0aGlzIG1ldGhvZCBiYXNpY2FsbHlcbiAgICogdHVybnMgdGhlIGZpbHRlciBpbiBcImZpbHRlciwgYnV0IGxldCB0aGUgZmlyc3QgcGFzc1wiLlxuICAgKiAqL1xuICBjaGVja0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXG4gICAgaWYgKCFpc1BsYXRmb3JtQnJvd3Nlcih0aGlzLnBsYXRmb3JtSWQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGVuYWJsZWQpIHtcbiAgICAgIC8vIHJlc2V0IHRoZSBnYXRlXG4gICAgICB0aGlzLmZpbHRlckdhdGUgPSBmYWxzZTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodGhpcy5maWx0ZXJHYXRlKSB7XG4gICAgICAgIC8vIGdhdGUgY2xvc2VkLCBmaXJzdCBlbWl0IGhhcyBoYXBwZW5lZFxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyB0aGlzIGlzIHRoZSBmaXJzdCBlbWl0IGZvciBlbmFibGVkID0gZmFsc2UsXG4gICAgICAgIC8vIGxldCBpdCBwYXNzLCBhbmQgYWN0aXZhdGUgdGhlIGdhdGVcbiAgICAgICAgLy8gc28gdGhlIG5leHQgd29udCBwYXNzLlxuICAgICAgICB0aGlzLmZpbHRlckdhdGUgPSB0cnVlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cblxuICB9XG5cbiAgQEhvc3RMaXN0ZW5lcignd2luZG93OnJlc2l6ZScsIFtdKVxuICBvbldpbmRvd1Jlc2l6ZSgpOiB2b2lkIHtcbiAgICBpZiAoaXNQbGF0Zm9ybUJyb3dzZXIodGhpcy5wbGF0Zm9ybUlkKSkge1xuICAgICAgdGhpcy5yZXNpemUkLm5leHQoKTtcbiAgICB9XG4gIH1cblxuICBzZXR1cExpc3RlbmVyKCk6IHZvaWQge1xuICAgIGlmIChpc1BsYXRmb3JtQnJvd3Nlcih0aGlzLnBsYXRmb3JtSWQpKSB7XG4gICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmdldFNjcm9sbFRhcmdldCgpO1xuICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ3Njcm9sbCcsIHRoaXMubGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuXG4gIGxpc3RlbmVyID0gKGU6IEV2ZW50KSA9PiB7XG4gICAgY29uc3QgdXBwZXJTY3JlZW5FZGdlQXQgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLnNjcm9sbFRvcCB8fCB3aW5kb3cucGFnZVlPZmZzZXQ7XG4gICAgdGhpcy5zY3JvbGwkLm5leHQodXBwZXJTY3JlZW5FZGdlQXQpO1xuICB9XG5cblxuICBuZ09uSW5pdCgpOiB2b2lkIHtcbiAgICB0aGlzLmNoZWNrU2V0dXAoKTtcbiAgICB0aGlzLnNldHVwTGlzdGVuZXIoKTtcbiAgfVxuXG4gIG5nT25EZXN0cm95KCk6IHZvaWQge1xuICAgIHRoaXMudGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Njcm9sbCcsIHRoaXMubGlzdGVuZXIpO1xuICAgIHRoaXMuY29tcG9uZW50RGVzdHJveWVkLm5leHQoKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0U2Nyb2xsVGFyZ2V0KCk6IEVsZW1lbnQgfCBXaW5kb3cge1xuICAgIGxldCB0YXJnZXQ6IEVsZW1lbnQgfCBXaW5kb3c7XG4gICAgaWYgKHRoaXMuc2Nyb2xsQ29udGFpbmVyICYmIHR5cGVvZiB0aGlzLnNjcm9sbENvbnRhaW5lciA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRhcmdldCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IodGhpcy5zY3JvbGxDb250YWluZXIpO1xuICAgICAgdGhpcy5tYXJnaW5Ub3AkLm5leHQoSW5maW5pdHkpO1xuICAgICAgdGhpcy5hdWRpdFRpbWUgPSAwO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY3JvbGxDb250YWluZXIgJiYgdGhpcy5zY3JvbGxDb250YWluZXIgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgdGFyZ2V0ID0gdGhpcy5zY3JvbGxDb250YWluZXI7XG4gICAgICB0aGlzLm1hcmdpblRvcCQubmV4dChJbmZpbml0eSk7XG4gICAgICB0aGlzLmF1ZGl0VGltZSA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldCA9IHdpbmRvdztcbiAgICB9XG4gICAgcmV0dXJuIHRhcmdldDtcbiAgfVxuICBnZXRDb21wdXRlZFN0eWxlKGVsOiBIVE1MRWxlbWVudCk6IENsaWVudFJlY3QgfCBET01SZWN0IHtcbiAgICByZXR1cm4gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIH1cblxuICBwcml2YXRlIGRldGVybWluZVN0YXR1cyhvcmlnaW5hbFZhbHM6IFN0aWNreVBvc2l0aW9ucywgcGFnZVlPZmZzZXQ6IG51bWJlciwgbWFyZ2luVG9wOiBudW1iZXIsIG1hcmdpbkJvdHRvbTogbnVtYmVyLCBlbmFibGVkOiBib29sZWFuKSB7XG4gICAgY29uc3QgZWxlbWVudFBvcyA9IHRoaXMuZGV0ZXJtaW5lRWxlbWVudE9mZnNldHMoKTtcbiAgICBsZXQgaXNTdGlja3kgPSBlbmFibGVkICYmIHBhZ2VZT2Zmc2V0ID4gb3JpZ2luYWxWYWxzLm9mZnNldFk7XG4gICAgaWYgKHBhZ2VZT2Zmc2V0IDwgZWxlbWVudFBvcy5vZmZzZXRZKSB7XG4gICAgICBpc1N0aWNreSA9IGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBzdGlja3lFbGVtZW50SGVpZ2h0ID0gdGhpcy5nZXRDb21wdXRlZFN0eWxlKHRoaXMuc3RpY2t5RWxlbWVudC5uYXRpdmVFbGVtZW50KS5oZWlnaHQ7XG4gICAgY29uc3QgcmVhY2hlZExvd2VyRWRnZSA9ICh0aGlzLmJvdW5kYXJ5RWxlbWVudCAhPSBudWxsKSA/IHRoaXMuYm91bmRhcnlFbGVtZW50ICYmIHdpbmRvdy5wYWdlWU9mZnNldCArIHN0aWNreUVsZW1lbnRIZWlnaHQgKyBtYXJnaW5Cb3R0b20gPj0gKG9yaWdpbmFsVmFscy5ib3R0b21Cb3VuZGFyeSAtIG1hcmdpblRvcCAqIDEuMCkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgcmVhY2hlZFVwcGVyRWRnZSA9ICh0aGlzLmJvdW5kYXJ5RWxlbWVudCAhPSBudWxsKSA/IHdpbmRvdy5wYWdlWU9mZnNldCA8ICh0aGlzLmJvdW5kYXJ5RWxlbWVudC5vZmZzZXRUb3AgKyBtYXJnaW5Ub3AgKiAxLjApIDogdW5kZWZpbmVkO1xuICAgIHRoaXMuc3RpY2t5UG9zaXRpb24uZW1pdCh7Li4uZWxlbWVudFBvcywgdXBwZXJTY3JlZW5FZGdlQXQ6IHBhZ2VZT2Zmc2V0LCBtYXJnaW5Cb3R0b20sIG1hcmdpblRvcH0pO1xuICAgIHJldHVybiB7XG4gICAgICBpc1N0aWNreSxcbiAgICAgIHJlYWNoZWRVcHBlckVkZ2UsXG4gICAgICByZWFjaGVkTG93ZXJFZGdlLFxuICAgIH07XG5cbiAgfVxuXG5cbiAgLy8gbm90IGFsd2F5cyBwaXhlbC4gZS5nLiBpZTlcbiAgcHJpdmF0ZSBnZXRNYXJnaW5zKCk6IHsgdG9wOiBudW1iZXIsIGJvdHRvbTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHN0aWNreVN0eWxlcyA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRoaXMuc3RpY2t5RWxlbWVudC5uYXRpdmVFbGVtZW50KTtcbiAgICBjb25zdCB0b3AgPSBwYXJzZUludChzdGlja3lTdHlsZXMubWFyZ2luVG9wLCAxMCk7XG4gICAgY29uc3QgYm90dG9tID0gcGFyc2VJbnQoc3RpY2t5U3R5bGVzLm1hcmdpbkJvdHRvbSwgMTApO1xuICAgIHJldHVybiB7dG9wLCBib3R0b219O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgdGhlIG9mZnNldCBmb3IgZWxlbWVudC4gSWYgdGhlIGVsZW1lbnRcbiAgICogY3VycmVudGx5IGlzIHN0aWNreSwgaXQgd2lsbCBnZXQgcmVtb3ZlZFxuICAgKiB0byBhY2Nlc3MgdGhlIG9yaWdpbmFsIHBvc2l0aW9uLiBPdGhlclxuICAgKiB3aXNlIHRoaXMgd291bGQganVzdCBiZSAwIGZvciBmaXhlZCBlbGVtZW50cy4gKi9cbiAgcHJpdmF0ZSBkZXRlcm1pbmVFbGVtZW50T2Zmc2V0cygpOiBTdGlja3lQb3NpdGlvbnMge1xuICAgIGlmICh0aGlzLnN0aWNreSkge1xuICAgICAgdGhpcy5yZW1vdmVTdGlja3koKTtcbiAgICB9XG4gICAgbGV0IGJvdHRvbUJvdW5kYXJ5OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgIGlmICh0aGlzLmJvdW5kYXJ5RWxlbWVudCkge1xuICAgICAgY29uc3QgYm91bmRhcnlFbGVtZW50SGVpZ2h0ID0gdGhpcy5nZXRDb21wdXRlZFN0eWxlKHRoaXMuYm91bmRhcnlFbGVtZW50KS5oZWlnaHQ7XG4gICAgICBjb25zdCBib3VuZGFyeUVsZW1lbnRPZmZzZXQgPSBnZXRQb3NpdGlvbih0aGlzLmJvdW5kYXJ5RWxlbWVudCkueTtcbiAgICAgIGJvdHRvbUJvdW5kYXJ5ID0gYm91bmRhcnlFbGVtZW50SGVpZ2h0ICsgYm91bmRhcnlFbGVtZW50T2Zmc2V0O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgb2Zmc2V0WTogKGdldFBvc2l0aW9uKHRoaXMuc3RpY2t5RWxlbWVudC5uYXRpdmVFbGVtZW50KS55IC0gdGhpcy5tYXJnaW5Ub3AkLnZhbHVlKSwgYm90dG9tQm91bmRhcnlcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBtYWtlU3RpY2t5KGJvdW5kYXJ5UmVhY2hlZDogYm9vbGVhbiA9IGZhbHNlLCBtYXJnaW5Ub3A6IG51bWJlciwgbWFyZ2luQm90dG9tOiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyBkbyB0aGlzIGJlZm9yZSBzZXR0aW5nIGl0IHRvIHBvczpmaXhlZFxuICAgIGNvbnN0IHt3aWR0aCwgaGVpZ2h0LCBsZWZ0fSA9IHRoaXMuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLnN0aWNreUVsZW1lbnQubmF0aXZlRWxlbWVudCk7XG4gICAgY29uc3Qgb2ZmU2V0ID0gYm91bmRhcnlSZWFjaGVkID8gKHRoaXMuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLmJvdW5kYXJ5RWxlbWVudCkuYm90dG9tIC0gaGVpZ2h0IC0gdGhpcy5tYXJnaW5Cb3R0b20kLnZhbHVlKSA6IHRoaXMubWFyZ2luVG9wJC52YWx1ZTtcbiAgICBpZiAodGhpcy5zY3JvbGxDb250YWluZXIgJiYgIXRoaXMuc3RpY2t5KSB7XG4gICAgICB0aGlzLnN0aWNreUVsZW1lbnQubmF0aXZlRWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdzdGlja3knO1xuICAgICAgdGhpcy5zdGlja3lFbGVtZW50Lm5hdGl2ZUVsZW1lbnQuc3R5bGUudG9wID0gJzBweCc7XG4gICAgICB0aGlzLnN0aWNreSA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3RpY2t5RWxlbWVudC5uYXRpdmVFbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcbiAgICAgIHRoaXMuc3RpY2t5RWxlbWVudC5uYXRpdmVFbGVtZW50LnN0eWxlLnRvcCA9IG9mZlNldCArICdweCc7XG4gICAgICB0aGlzLnN0aWNreUVsZW1lbnQubmF0aXZlRWxlbWVudC5zdHlsZS5sZWZ0ID0gbGVmdCArICdweCc7XG4gICAgICB0aGlzLnN0aWNreUVsZW1lbnQubmF0aXZlRWxlbWVudC5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcbiAgICB9XG4gICAgaWYgKHRoaXMuc3BhY2VyRWxlbWVudCkge1xuICAgICAgY29uc3Qgc3BhY2VySGVpZ2h0ID0gbWFyZ2luQm90dG9tICsgaGVpZ2h0ICsgbWFyZ2luVG9wO1xuICAgICAgdGhpcy5zcGFjZXJFbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke3NwYWNlckhlaWdodH1weGA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBkZXRlcm1pbmVCb3VuZGFyeVJlYWNoZWQoYm91bmRhcnlIZWlnaHQ6IG51bWJlciwgc3RpY2t5RWxIZWlnaHQ6IG51bWJlciwgY3NzTWFyZ2lucywgbWFyZ2luVG9wOiBudW1iZXIsIG1hcmdpbkJvdHRvbTogbnVtYmVyLCB1cHBlclNjcmVlbkVkZ2VBdDogbnVtYmVyKSB7XG5cbiAgICBjb25zdCBib3VuZGFyeUVsZW1lbnRQb3MgPSBnZXRQb3NpdGlvbih0aGlzLmJvdW5kYXJ5RWxlbWVudCk7XG5cbiAgICBjb25zdCBib3VuZGFyeUVsZW1lbnRMb3dlckVkZ2UgPSBib3VuZGFyeUVsZW1lbnRQb3MueSArIGJvdW5kYXJ5SGVpZ2h0O1xuICAgIGNvbnN0IGxvd2VyRWRnZVN0aWNreUVsZW1lbnQgPSB1cHBlclNjcmVlbkVkZ2VBdCArIHN0aWNreUVsSGVpZ2h0ICsgbWFyZ2luVG9wICsgY3NzTWFyZ2lucy50b3AgKyBtYXJnaW5Cb3R0b20gKyBjc3NNYXJnaW5zLmJvdHRvbTtcblxuICAgIHJldHVybiBib3VuZGFyeUVsZW1lbnRMb3dlckVkZ2UgPD0gbG93ZXJFZGdlU3RpY2t5RWxlbWVudDtcbiAgfVxuXG4gIHByaXZhdGUgY2hlY2tTZXR1cCgpIHtcbiAgICBpZiAoaXNEZXZNb2RlKCkgJiYgIXRoaXMuc3BhY2VyRWxlbWVudCkge1xuICAgICAgY29uc29sZS53YXJuKGAqKioqKipUaGVyZSBtaWdodCBiZSBhbiBpc3N1ZSB3aXRoIHlvdXIgc3RpY2t5IGRpcmVjdGl2ZSEqKioqKipcblxuWW91IGhhdmVuJ3Qgc3BlY2lmaWVkIGEgc3BhY2VyIGVsZW1lbnQuIFRoaXMgd2lsbCBjYXVzZSB0aGUgcGFnZSB0byBqdW1wLlxuXG5CZXN0IHByYWN0aXNlIGlzIHRvIHByb3ZpZGUgYSBzcGFjZXIgZWxlbWVudCAoZS5nLiBhIGRpdikgcmlnaHQgYmVmb3JlL2FmdGVyIHRoZSBzdGlja3kgZWxlbWVudC5cblRoZW4gcGFzcyB0aGUgc3BhY2VyIGVsZW1lbnQgYXMgaW5wdXQ6XG5cbjxkaXYgI3NwYWNlcj48L2Rpdj5cblxuPGRpdiBzdGlja3lUaGluZz1cIlwiIFtzcGFjZXJdPVwic3BhY2VyXCI+XG4gICAgSSBhbSBzdGlja3khXG48L2Rpdj5gKTtcbiAgICB9XG4gIH1cblxuXG4gIHByaXZhdGUgc2V0U3RpY2t5KHN0YXR1czogU3RpY2t5U3RhdHVzKTogdm9pZCB7XG4gICAgaWYgKHN0YXR1cy5pc1N0aWNreSkge1xuICAgICAgaWYgKHRoaXMudXBwZXJCb3VuZFJlYWNoZWQpIHtcbiAgICAgICAgdGhpcy5yZW1vdmVTdGlja3koKTtcbiAgICAgICAgdGhpcy5pc1N0aWNreSA9IGZhbHNlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5tYWtlU3RpY2t5KHN0YXR1cy5yZWFjaGVkTG93ZXJFZGdlLCBzdGF0dXMubWFyZ2luVG9wLCBzdGF0dXMubWFyZ2luQm90dG9tKTtcbiAgICAgICAgdGhpcy5pc1N0aWNreSA9IHRydWU7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVtb3ZlU3RpY2t5KCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzZXRTdGF0dXMoc3RhdHVzOiBTdGlja3lTdGF0dXMpIHtcbiAgICB0aGlzLnVwcGVyQm91bmRSZWFjaGVkID0gc3RhdHVzLnJlYWNoZWRVcHBlckVkZ2U7XG4gICAgdGhpcy5ib3VuZGFyeVJlYWNoZWQgPSBzdGF0dXMucmVhY2hlZExvd2VyRWRnZTtcbiAgICB0aGlzLnN0aWNreVN0YXR1cy5uZXh0KHN0YXR1cyk7XG4gIH1cblxuICBwcml2YXRlIHJlbW92ZVN0aWNreSgpOiB2b2lkIHtcbiAgICB0aGlzLmJvdW5kYXJ5UmVhY2hlZCA9IGZhbHNlO1xuICAgIHRoaXMuc3RpY2t5ID0gZmFsc2U7XG4gICAgdGhpcy5zdGlja3lFbGVtZW50Lm5hdGl2ZUVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnJztcbiAgICB0aGlzLnN0aWNreUVsZW1lbnQubmF0aXZlRWxlbWVudC5zdHlsZS53aWR0aCA9ICdhdXRvJztcbiAgICB0aGlzLnN0aWNreUVsZW1lbnQubmF0aXZlRWxlbWVudC5zdHlsZS5sZWZ0ID0gJ2F1dG8nO1xuICAgIHRoaXMuc3RpY2t5RWxlbWVudC5uYXRpdmVFbGVtZW50LnN0eWxlLnRvcCA9ICdhdXRvJztcbiAgICBpZiAodGhpcy5zcGFjZXJFbGVtZW50KSB7XG4gICAgICB0aGlzLnNwYWNlckVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzAnO1xuICAgIH1cbiAgfVxufVxuXG4vLyBUaGFua3MgdG8gaHR0cHM6Ly9zdGFua28uZ2l0aHViLmlvL2phdmFzY3JpcHQtZ2V0LWVsZW1lbnQtb2Zmc2V0L1xuZnVuY3Rpb24gZ2V0UG9zaXRpb24oZWwpIHtcbiAgbGV0IHRvcCA9IDA7XG4gIGxldCBsZWZ0ID0gMDtcbiAgbGV0IGVsZW1lbnQgPSBlbDtcblxuICAvLyBMb29wIHRocm91Z2ggdGhlIERPTSB0cmVlXG4gIC8vIGFuZCBhZGQgaXQncyBwYXJlbnQncyBvZmZzZXQgdG8gZ2V0IHBhZ2Ugb2Zmc2V0XG4gIGRvIHtcbiAgICB0b3AgKz0gZWxlbWVudC5vZmZzZXRUb3AgfHwgMDtcbiAgICBsZWZ0ICs9IGVsZW1lbnQub2Zmc2V0TGVmdCB8fCAwO1xuICAgIGVsZW1lbnQgPSBlbGVtZW50Lm9mZnNldFBhcmVudDtcbiAgfSB3aGlsZSAoZWxlbWVudCk7XG5cbiAgcmV0dXJuIHtcbiAgICB5OiB0b3AsXG4gICAgeDogbGVmdCxcbiAgfTtcbn1cbiJdfQ==